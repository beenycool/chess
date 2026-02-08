import { useEffect, useRef, useState, useCallback } from 'react'
import { useGameStore, ChatMessage } from '@/store/game-store'
import { createInitialGame, processMove, tryJoinGame } from '@/lib/game-logic'
import { recordGameResult } from '@/lib/game-results'
import type { GameState } from '@/types/database'
import { createBrowserSupabase } from '@/lib/supabase'
import { useAuth } from './use-auth'

// Database polling interval (ms)
const POLL_INTERVAL = 1000

export function usePeerGame(gameId: string, initialOptions?: { timeControl?: string, color?: string }) {
  const {
    setGame,
    gameState,
    setGameState,
    moves,
    setMoves,
    addChatMessage,
    setChatMessages,
    setPlayerId,
    setPlayerColor,
    setIsConnected,
    playerColor,
  } = useGameStore()

  const { profile } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const supabase = createBrowserSupabase()
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const isHostRef = useRef(false)
  const lastMoveIndexRef = useRef(0)

  const createClientId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return Math.random().toString(36).substring(2, 15)
  }

  // Persistence for Player ID - use sessionStorage for tab-specific persistence
  const [playerId] = useState(() => {
    if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem('chess_p2p_id')
        if (stored) return stored
        const newId = createClientId()
        sessionStorage.setItem('chess_p2p_id', newId)
        return newId
    }
    return ''
  })

  useEffect(() => {
    setPlayerId(playerId)
  }, [playerId, setPlayerId])

  // Initialize or join game
  useEffect(() => {
    if (!gameId || !playerId) return

    const initGame = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Check if game exists in database
        const { data: existingGame, error: fetchError } = await supabase
          .from('games')
          .select('*')
          .eq('id', gameId)
          .single()

        if (fetchError && fetchError.code !== 'PGRST116') {
          // PGRST116 = not found, other errors are real errors
          throw fetchError
        }

        if (!existingGame) {
          // Game doesn't exist - we're the host, create it
          isHostRef.current = true
          
          if (initialOptions) {
            const { game: newGame, gameState: newGameState } = createInitialGame(gameId, {
              timeControlName: initialOptions.timeControl || '10+0',
              colorPreference: (initialOptions.color as 'white' | 'black' | 'random') || 'random',
              hostPlayerId: playerId
            })

            // Set profile IDs if logged in
            if (newGame.white_player_id === playerId) newGame.white_id = profile?.id || null
            if (newGame.black_player_id === playerId) newGame.black_id = profile?.id || null

            // Insert game into database
            const { error: insertError } = await supabase.from('games').insert(newGame)
            if (insertError) throw insertError

            // Insert initial game state
            const { error: stateError } = await supabase.from('game_states').insert({
              ...newGameState,
              id: undefined // Let DB auto-generate
            })
            if (stateError) throw stateError

            // Set local state
            setGame(newGame)
            setGameState(newGameState)
            setMoves([])
            setChatMessages([])

            if (newGame.white_player_id === playerId) setPlayerColor('white')
            else if (newGame.black_player_id === playerId) setPlayerColor('black')
          } else {
            setError('Game not found. It may have been deleted or never existed.')
            setIsLoading(false)
            return
          }
        } else {
          // Game exists - we're joining as guest or rejoining
          isHostRef.current = false
          
          // Load game state
          const { data: gameStateData, error: stateError } = await supabase
            .from('game_states')
            .select('*')
            .eq('game_id', gameId)
            .single()

          if (stateError && stateError.code !== 'PGRST116') {
            console.error('Error fetching game state:', stateError)
            // Don't fail the whole initialization if game_state is missing
            // The game might exist but game_state got corrupted/removed
          }

          // Load moves
          const { data: movesData, error: movesError } = await supabase
            .from('moves')
            .select('*')
            .eq('game_id', gameId)
            .order('move_index', { ascending: true })

          if (movesError) {
            console.error('Error fetching moves:', movesError)
          }

          // Load chat messages from local storage (not persisted to DB for now)
          const storedChat = sessionStorage.getItem(`chat_${gameId}`)
          const chatData: ChatMessage[] = storedChat ? JSON.parse(storedChat) : []

          setGame(existingGame)
          
          // If game state is missing, create a new one for active/completed games
          if (!gameStateData) {
            console.warn('Game state not found, creating default state')
            const defaultGameState = {
              game_id: gameId,
              fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
              pgn: '',
              move_index: movesData?.length || 0,
              turn: (movesData?.length || 0) % 2 === 0 ? 'w' : 'b',
              white_time_ms: existingGame.initial_time_ms,
              black_time_ms: existingGame.initial_time_ms,
              last_move_at: null,
              is_check: false,
              is_checkmate: false,
              is_stalemate: false,
              is_draw: false,
              draw_reason: null,
              last_move_san: null,
              last_move_from: null,
              last_move_to: null,
              updated_at: new Date().toISOString()
            }
            setGameState(defaultGameState as GameState)
          } else {
            setGameState(gameStateData)
          }
          
          if (movesData) setMoves(movesData)
          setChatMessages(chatData)

          // Determine player color
          if (existingGame.white_player_id === playerId) setPlayerColor('white')
          else if (existingGame.black_player_id === playerId) setPlayerColor('black')
          else setPlayerColor(null)

          lastMoveIndexRef.current = movesData?.length || 0
        }

        setIsConnected(true)
        setIsLoading(false)
      } catch (err) {
        console.error('Error initializing game:', err)
        setError(err instanceof Error ? err.message : 'Failed to initialize game')
        setIsLoading(false)
      }
    }

    initGame()

    // Start polling
    pollRef.current = setInterval(async () => {
      try {
        // Fetch latest game state
        const { data: latestGame } = await supabase
          .from('games')
          .select('*')
          .eq('id', gameId)
          .single()

        const { data: latestState } = await supabase
          .from('game_states')
          .select('*')
          .eq('game_id', gameId)
          .single()

        const { data: latestMoves } = await supabase
          .from('moves')
          .select('*')
          .eq('game_id', gameId)
          .order('move_index', { ascending: true })

        if (latestGame) setGame(latestGame)
        if (latestState) setGameState(latestState)
        if (latestMoves && latestMoves.length !== moves.length) {
          setMoves(latestMoves)
          lastMoveIndexRef.current = latestMoves.length
        }

        // Update player color if assigned
        if (latestGame) {
          if (latestGame.white_player_id === playerId) setPlayerColor('white')
          else if (latestGame.black_player_id === playerId) setPlayerColor('black')
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, POLL_INTERVAL)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      setIsConnected(false)
    }
  }, [gameId, playerId, initialOptions, profile, setGame, setGameState, setMoves, setChatMessages, setPlayerColor, setIsConnected, moves.length, supabase])

  // --- Public Interface ---

  const joinGame = useCallback(async (color: 'white' | 'black'): Promise<{ success: boolean, error?: string }> => {
    try {
      // Fetch current game state
      const { data: currentGame, error: fetchError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (fetchError || !currentGame) {
        return { success: false, error: 'Game not found' }
      }

      // Check if player is already in the game
      if (currentGame.white_player_id === playerId) {
        setPlayerColor('white')
        return { success: true }
      }
      if (currentGame.black_player_id === playerId) {
        setPlayerColor('black')
        return { success: true }
      }

      // Try to join with requested color
      const result = tryJoinGame(currentGame, playerId, color)
      
      if (!result.success || !result.game) {
        return { success: false, error: 'Failed to join game - slot may be taken' }
      }

      const updatedGame = { ...result.game }
      if (color === 'white') updatedGame.white_id = profile?.id || null
      else updatedGame.black_id = profile?.id || null

      // Update game in database
      const { error: updateError } = await supabase
        .from('games')
        .update({
          white_player_id: updatedGame.white_player_id,
          black_player_id: updatedGame.black_player_id,
          white_id: updatedGame.white_id,
          black_id: updatedGame.black_id,
          status: updatedGame.status,
          started_at: updatedGame.started_at
        })
        .eq('id', gameId)

      if (updateError) throw updateError

      setGame(updatedGame)
      if (result.color) setPlayerColor(result.color)

      return { success: true }
    } catch (err) {
      console.error('Error joining game:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Failed to join game' }
    }
  }, [gameId, playerId, profile, setGame, setPlayerColor, supabase])

  const makeMove = useCallback(async (from: string, to: string, promotion?: string): Promise<{ success: boolean, error?: string, pending?: boolean }> => {
    try {
      // Fetch current game and state
      const { data: currentGame } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      const { data: currentState } = await supabase
        .from('game_states')
        .select('*')
        .eq('game_id', gameId)
        .single()

      if (!currentGame || !currentState) {
        return { success: false, error: 'Game not found' }
      }

      // Check if it's our turn
      const isWhiteTurn = currentState.turn === 'w'
      const ourColor = currentGame.white_player_id === playerId ? 'white' : 
                       currentGame.black_player_id === playerId ? 'black' : null
      
      if (!ourColor) {
        return { success: false, error: 'You are not a player in this game' }
      }

      if ((isWhiteTurn && ourColor !== 'white') || (!isWhiteTurn && ourColor !== 'black')) {
        return { success: false, error: 'Not your turn' }
      }

      // Process the move
      const result = processMove(currentGame, currentState, { from, to, promotion })
      
      if (!result.success || !result.newGameState || !result.newMove) {
        return { success: false, error: result.error || 'Invalid move' }
      }

      // Insert the move
      const { error: moveError } = await supabase.from('moves').insert({
        ...result.newMove,
        id: undefined // Let DB auto-generate
      })
      if (moveError) throw moveError

      // Update game state
      const { error: stateError } = await supabase
        .from('game_states')
        .update({
          fen: result.newGameState.fen,
          pgn: result.newGameState.pgn,
          move_index: result.newGameState.move_index,
          turn: result.newGameState.turn,
          white_time_ms: result.newGameState.white_time_ms,
          black_time_ms: result.newGameState.black_time_ms,
          last_move_at: result.newGameState.last_move_at,
          is_check: result.newGameState.is_check,
          is_checkmate: result.newGameState.is_checkmate,
          is_stalemate: result.newGameState.is_stalemate,
          is_draw: result.newGameState.is_draw,
          draw_reason: result.newGameState.draw_reason,
          last_move_san: result.newGameState.last_move_san,
          last_move_from: result.newGameState.last_move_from,
          last_move_to: result.newGameState.last_move_to,
          updated_at: result.newGameState.updated_at
        })
        .eq('game_id', gameId)
      if (stateError) throw stateError

      // Update game if completed
      if (result.gameUpdate) {
        const { error: gameError } = await supabase
          .from('games')
          .update({
            status: result.gameUpdate.status,
            result: result.gameUpdate.result,
            result_reason: result.gameUpdate.result_reason,
            ended_at: result.gameUpdate.ended_at
          })
          .eq('id', gameId)
        if (gameError) throw gameError

        // Record game result
        if (result.gameUpdate.status === 'completed') {
          await recordGameResult({
            gameId: gameId,
            whiteId: currentGame.white_id,
            blackId: currentGame.black_id,
            result: result.gameUpdate.result as 'white' | 'black' | 'draw',
            reason: result.gameUpdate.result_reason || 'unknown',
            pgn: result.newGameState.pgn
          })
        }
      }

      // Update local state immediately
      setGameState(result.newGameState)
      setMoves([...moves, result.newMove])

      return { success: true }
    } catch (err) {
      console.error('Error making move:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Failed to make move' }
    }
  }, [gameId, playerId, moves, setGameState, setMoves, supabase])

  const resign = useCallback(async () => {
    try {
      const { data: currentGame } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (!currentGame || currentGame.status !== 'active') return

      const ourColor = currentGame.white_player_id === playerId ? 'white' : 
                       currentGame.black_player_id === playerId ? 'black' : null
      
      if (!ourColor) return

      const winner = ourColor === 'white' ? 'black' : 'white'
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('games')
        .update({
          status: 'completed',
          result: winner,
          result_reason: 'resignation',
          ended_at: now
        })
        .eq('id', gameId)

      if (error) throw error

      // Record result
      await recordGameResult({
        gameId: gameId,
        whiteId: currentGame.white_id,
        blackId: currentGame.black_id,
        result: winner,
        reason: 'resignation',
        pgn: gameState?.pgn || ''
      })
    } catch (err) {
      console.error('Error resigning:', err)
      setError(err instanceof Error ? err.message : 'Failed to resign')
    }
  }, [gameId, playerId, gameState, supabase])

  const offerDraw = useCallback(() => {
    // Draw offers are not persisted to DB in this implementation
    // They could be added to a separate table if needed
    setError('Draw offers not supported in database mode')
  }, [])

  const acceptDraw = useCallback(async () => {
    try {
      const { data: currentGame } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (!currentGame || currentGame.status !== 'active') return

      const now = new Date().toISOString()

      const { error } = await supabase
        .from('games')
        .update({
          status: 'completed',
          result: 'draw',
          result_reason: 'agreement',
          ended_at: now
        })
        .eq('id', gameId)

      if (error) throw error

      // Record result
      await recordGameResult({
        gameId: gameId,
        whiteId: currentGame.white_id,
        blackId: currentGame.black_id,
        result: 'draw',
        reason: 'agreement',
        pgn: gameState?.pgn || ''
      })
    } catch (err) {
      console.error('Error accepting draw:', err)
      setError(err instanceof Error ? err.message : 'Failed to accept draw')
    }
  }, [gameId, gameState, supabase])

  const handleTimeout = useCallback(async (loser: 'white' | 'black') => {
    try {
      const { data: currentGame } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (!currentGame || currentGame.status !== 'active') return

      const winner = loser === 'white' ? 'black' : 'white'
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('games')
        .update({
          status: 'completed',
          result: winner,
          result_reason: 'timeout',
          ended_at: now
        })
        .eq('id', gameId)

      if (error) throw error

      // Record result
      await recordGameResult({
        gameId: gameId,
        whiteId: currentGame.white_id,
        blackId: currentGame.black_id,
        result: winner,
        reason: 'timeout',
        pgn: gameState?.pgn || ''
      })
    } catch (err) {
      console.error('Error handling timeout:', err)
      setError(err instanceof Error ? err.message : 'Failed to record timeout')
    }
  }, [gameId, gameState, supabase])

  const sendChat = useCallback((text: string) => {
    // Chat is stored locally in sessionStorage, not persisted to DB
    const message: ChatMessage = {
      id: createClientId(),
      senderId: playerId,
      senderName: profile?.username || (playerColor === 'white' ? 'White' : playerColor === 'black' ? 'Black' : 'Spectator'),
      text,
      timestamp: Date.now()
    }

    addChatMessage(message)

    // Persist to session storage
    const stored = sessionStorage.getItem(`chat_${gameId}`)
    const chatData: ChatMessage[] = stored ? JSON.parse(stored) : []
    chatData.push(message)
    sessionStorage.setItem(`chat_${gameId}`, JSON.stringify(chatData.slice(-200)))
  }, [gameId, playerId, profile, playerColor, addChatMessage])

  return {
    error,
    isLoading,
    makeMove,
    joinGame,
    resign,
    offerDraw,
    acceptDraw,
    handleTimeout,
    sendChat
  }
}
