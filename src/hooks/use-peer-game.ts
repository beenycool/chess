import { useEffect, useRef, useState, useCallback } from 'react'
import type { DataConnection, Peer } from 'peerjs'
import { useGameStore, ChatMessage } from '@/store/game-store'
import { createInitialGame, processMove, tryJoinGame } from '@/lib/game-logic'
import { recordGameResult } from '@/lib/game-results'
import type { Game, GameState, Move } from '@/types/database'
import { createBrowserSupabase } from '@/lib/supabase'
import { useAuth } from './use-auth'

type Message =
  | { type: 'JOIN_REQUEST', payload: { playerId: string, color?: 'white' | 'black', profileId?: string } }
  | { type: 'SYNC_GAME', payload: { game: Game, gameState: GameState, moves: Move[], chatMessages: ChatMessage[] } }
  | { type: 'MAKE_MOVE', payload: { from: string, to: string, promotion?: string } }
  | { type: 'ACTION', payload: { action: 'resign' | 'offer_draw' | 'accept_draw' | 'timeout', playerId: string, loser?: 'white' | 'black' } }
  | { type: 'CHAT', payload: ChatMessage }
  | { type: 'ERROR', payload: string }

export function usePeerGame(gameId: string, initialOptions?: { timeControl?: string, color?: string }) {
  const {
    game,
    setGame,
    gameState,
    setGameState,
    moves,
    setMoves,
    chatMessages,
    addChatMessage,
    setChatMessages,
    setPlayerId,
    setPlayerColor,
    setIsConnected,
    playerColor,
  } = useGameStore()

  const { profile } = useAuth()
  const [error, setError] = useState<string | null>(null)

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

  // Keep latest state in ref for callbacks
  const gameStateRef = useRef<{ game: Game | null; gameState: GameState | null; moves: Move[]; chatMessages: ChatMessage[] }>({
    game: null, gameState: null, moves: [], chatMessages: []
  })

  useEffect(() => {
    gameStateRef.current = { game, gameState, moves, chatMessages }
  }, [game, gameState, moves, chatMessages])

  useEffect(() => {
    setPlayerId(playerId)
  }, [playerId, setPlayerId])

  const peerRef = useRef<Peer | null>(null)
  const hostConnRef = useRef<DataConnection | null>(null)
  const guestConnsRef = useRef<Map<string, DataConnection>>(new Map())
  const isHostRef = useRef(false)
  const supabase = createBrowserSupabase()

  const broadcast = useCallback((msg: Message, excludePeer?: string) => {
    guestConnsRef.current.forEach((conn, peerId) => {
      if (peerId !== excludePeer) {
        conn.send(msg)
      }
    })
  }, [])

  const sendToHost = useCallback((msg: Message) => {
    if (hostConnRef.current) {
      hostConnRef.current.send(msg)
    }
  }, [])

  const sendError = useCallback((conn: DataConnection, message: string) => {
    conn.send({ type: 'ERROR', payload: message })
  }, [])

  const publishGameToSupabase = useCallback(async (gameData: Game) => {
    if (!isHostRef.current) return
    const { error } = await supabase.from('games').upsert(gameData)
    if (error) console.error('Failed to publish game:', error)
  }, [supabase])

  const syncStateToGuest = useCallback((conn: DataConnection) => {
    const { game, gameState, moves, chatMessages } = gameStateRef.current
    if (game && gameState) {
      conn.send({
        type: 'SYNC_GAME',
        payload: { game, gameState, moves, chatMessages }
      })
    }
  }, [])

  const handleGameCompletion = useCallback(async (updatedGame: Game) => {
    if (!isHostRef.current) return

    await recordGameResult({
      gameId: updatedGame.id,
      whiteId: updatedGame.white_id,
      blackId: updatedGame.black_id,
      result: updatedGame.result as 'white' | 'black' | 'draw',
      reason: updatedGame.result_reason || 'unknown',
      pgn: gameStateRef.current.gameState?.pgn || '',
    })

    await publishGameToSupabase(updatedGame)
  }, [publishGameToSupabase])

  const handleActionAsHost = useCallback(async (payload: { action: 'resign' | 'offer_draw' | 'accept_draw' | 'timeout', playerId: string, loser?: 'white' | 'black' }) => {
     const { game, gameState } = gameStateRef.current
     if (!game || !gameState || game.status !== 'active') return

     let updatedGame = { ...game }
     let resultChanged = false

     if (payload.action === 'resign') {
        updatedGame.status = 'completed'
        updatedGame.ended_at = new Date().toISOString()
        updatedGame.result_reason = 'resignation'
        if (updatedGame.white_player_id === payload.playerId) updatedGame.result = 'black'
        else if (updatedGame.black_player_id === payload.playerId) updatedGame.result = 'white'
        resultChanged = true
     } else if (payload.action === 'offer_draw') {
        // Logic for draw offers not fully implemented in state yet, just broadcast
        broadcast({ type: 'ACTION', payload })
        return
     } else if (payload.action === 'accept_draw') {
        updatedGame.status = 'completed'
        updatedGame.ended_at = new Date().toISOString()
        updatedGame.result = 'draw'
        updatedGame.result_reason = 'agreement'
        resultChanged = true
     } else if (payload.action === 'timeout') {
        updatedGame.status = 'completed'
        updatedGame.ended_at = new Date().toISOString()
        updatedGame.result_reason = 'timeout'
        updatedGame.result = payload.loser === 'white' ? 'black' : 'white'
        resultChanged = true
     }

     if (resultChanged) {
        setGame(updatedGame)
        broadcast({
            type: 'SYNC_GAME',
            payload: { game: updatedGame, gameState, moves: gameStateRef.current.moves, chatMessages: gameStateRef.current.chatMessages }
        })

        if (updatedGame.status === 'completed') {
          await handleGameCompletion(updatedGame)
        } else {
          await publishGameToSupabase(updatedGame)
        }
     }
  }, [broadcast, setGame, handleGameCompletion, publishGameToSupabase])

  const isValidMessage = (data: unknown): data is Message => {
    if (!data || typeof data !== 'object') return false
    const msg = data as Record<string, any>
    if (typeof msg.type !== 'string') return false
    if (!msg.payload) return false

    switch (msg.type) {
      case 'MAKE_MOVE':
        return typeof msg.payload.from === 'string' && typeof msg.payload.to === 'string'
      case 'CHAT':
        return typeof msg.payload.id === 'string'
          && typeof msg.payload.senderId === 'string'
          && typeof msg.payload.senderName === 'string'
          && typeof msg.payload.text === 'string'
          && typeof msg.payload.timestamp === 'number'
      case 'JOIN_REQUEST':
        return typeof msg.payload.playerId === 'string'
      case 'ACTION':
        return typeof msg.payload.action === 'string' && typeof msg.payload.playerId === 'string'
      case 'SYNC_GAME':
        return Boolean(msg.payload.game && msg.payload.gameState)
          && Array.isArray(msg.payload.moves)
          && Array.isArray(msg.payload.chatMessages)
      case 'ERROR':
        return typeof msg.payload === 'string'
      default:
        return false
    }
  }

  const handleMessageAsHost = useCallback(async (msg: Message, senderConn: DataConnection) => {
    switch (msg.type) {
      case 'JOIN_REQUEST': {
        const { game } = gameStateRef.current
        if (!game) return

        const result = tryJoinGame(game, msg.payload.playerId, msg.payload.color)
        if (result.success && result.game) {
          const updatedGame = { ...result.game }

          if (result.color === 'white') updatedGame.white_id = msg.payload.profileId || null
          else if (result.color === 'black') updatedGame.black_id = msg.payload.profileId || null

          const currentGameState = gameStateRef.current.gameState
          if (!currentGameState) return

          setGame(updatedGame)
          broadcast({
            type: 'SYNC_GAME',
            payload: { game: updatedGame, gameState: currentGameState, moves: gameStateRef.current.moves, chatMessages: gameStateRef.current.chatMessages }
          })
          await publishGameToSupabase(updatedGame)
        } else {
          sendError(senderConn, 'Failed to join game')
        }
        break
      }

      case 'MAKE_MOVE': {
        const { game, gameState, moves } = gameStateRef.current
        if (!game || !gameState) return

        const result = processMove(game, gameState, msg.payload)
        if (!result.success) {
          sendError(senderConn, result.error || 'Invalid move')
        } else if (result.newGameState && result.newMove) {
          const updatedMoves = [...moves, result.newMove]
          setGameState(result.newGameState)
          setMoves(updatedMoves)

          const updatedGame = result.gameUpdate ? { ...game, ...result.gameUpdate } : game
          if (result.gameUpdate) {
            setGame(updatedGame)
          }

          broadcast({
            type: 'SYNC_GAME',
            payload: { game: updatedGame, gameState: result.newGameState, moves: updatedMoves, chatMessages: gameStateRef.current.chatMessages }
          })

          if (updatedGame.status === 'completed') {
            await handleGameCompletion(updatedGame)
          }
        }
        break
      }

      case 'ACTION': {
         handleActionAsHost(msg.payload)
         break
      }

      case 'CHAT': {
         addChatMessage(msg.payload)
         broadcast(msg, senderConn.peer)
         break
      }
    }
  }, [broadcast, handleActionAsHost, sendError, setGame, setGameState, setMoves, handleGameCompletion, publishGameToSupabase, addChatMessage])

  const handleMessageAsGuest = useCallback((msg: Message) => {
    switch (msg.type) {
      case 'SYNC_GAME': {
        const { game: newGame, gameState: newGameState, moves: newMoves, chatMessages: newChatMessages } = msg.payload
        setGame(newGame)
        setGameState(newGameState)
        setMoves(newMoves)
        const hostIds = new Set(newChatMessages.map((message) => message.id))
        const localOnly = useGameStore.getState().chatMessages.filter((message) => !hostIds.has(message.id))
        setChatMessages([...newChatMessages, ...localOnly])

        if (newGame.white_player_id === playerId) setPlayerColor('white')
        else if (newGame.black_player_id === playerId) setPlayerColor('black')
        else setPlayerColor(null)
        break
      }
      case 'ACTION': {
        break
      }
      case 'CHAT': {
        addChatMessage(msg.payload)
        break
      }
      case 'ERROR': {
        setError(msg.payload)
        break
      }
    }
  }, [playerId, setGame, setGameState, setMoves, setPlayerColor, setChatMessages, addChatMessage])

  useEffect(() => {
    if (!gameId || !playerId || peerRef.current) return

    const initPeer = async () => {
      const { default: Peer } = await import('peerjs')
      const peer = new Peer(gameId)

      peer.on('open', async () => {
        isHostRef.current = true
        setIsConnected(true)

        if (initialOptions) {
          const { game: newGame, gameState: newGameState } = createInitialGame(gameId, {
            timeControlName: initialOptions.timeControl || '10+0',
            colorPreference: (initialOptions.color as 'white' | 'black' | 'random') || 'random',
            hostPlayerId: playerId
          })

          if (newGame.white_player_id === playerId) newGame.white_id = profile?.id || null
          if (newGame.black_player_id === playerId) newGame.black_id = profile?.id || null

          setGame(newGame)
          setGameState(newGameState)
          setMoves([])
          setChatMessages([])

          if (newGame.white_player_id === playerId) setPlayerColor('white')
          else if (newGame.black_player_id === playerId) setPlayerColor('black')

          await publishGameToSupabase(newGame)
        }
      })

      peer.on('connection', (conn) => {
        guestConnsRef.current.set(conn.peer, conn)
        conn.on('open', () => syncStateToGuest(conn))
        conn.on('data', (data) => {
          if (isValidMessage(data)) handleMessageAsHost(data, conn)
        })
      })

      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable' || err.type === 'invalid-id') {
          peer.destroy()
          joinAsGuest()
        } else {
          setError(err.message)
        }
      })
      peerRef.current = peer
    }

    const joinAsGuest = async () => {
      const { default: Peer } = await import('peerjs')
      const peer = new Peer()
      peer.on('open', () => {
        isHostRef.current = false
        const conn = peer.connect(gameId)
        conn.on('open', () => {
          setIsConnected(true)
          hostConnRef.current = conn
        })
        conn.on('data', (data) => {
          if (isValidMessage(data)) handleMessageAsGuest(data)
        })
      })
      peerRef.current = peer
    }

    initPeer()

    return () => {
      peerRef.current?.destroy()
      peerRef.current = null
      hostConnRef.current = null
      guestConnsRef.current.clear()
    }
  }, [gameId, playerId, initialOptions, profile, setGame, setGameState, setMoves, setChatMessages, setPlayerColor, setIsConnected, syncStateToGuest, handleMessageAsHost, handleMessageAsGuest, publishGameToSupabase])

  // --- Public Interface ---

  const joinGame = useCallback(async (color: 'white' | 'black'): Promise<{ success: boolean, error?: string }> => {
    if (isHostRef.current) {
        const { game } = gameStateRef.current
        if (!game) return { success: false, error: 'Game not found' }
        const result = tryJoinGame(game, playerId, color)
        if (result.success && result.game) {
            const updatedGame = { ...result.game }
            if (color === 'white') updatedGame.white_id = profile?.id || null
            else updatedGame.black_id = profile?.id || null

            setGame(updatedGame)
            if (result.color) setPlayerColor(result.color)
            const currentGameState = gameStateRef.current.gameState
            if (!currentGameState) return { success: false, error: 'Game not ready' }
            broadcast({
                type: 'SYNC_GAME',
                payload: { game: updatedGame, gameState: currentGameState, moves: gameStateRef.current.moves, chatMessages: gameStateRef.current.chatMessages }
            })
            await publishGameToSupabase(updatedGame)
            return { success: true }
        }
        return { success: false, error: 'Failed to join game' }
    } else {
        sendToHost({
            type: 'JOIN_REQUEST',
            payload: { playerId, color, profileId: profile?.id }
        })
        return { success: true }
    }
  }, [playerId, profile, sendToHost, broadcast, setGame, setPlayerColor, publishGameToSupabase])

  const makeMove = useCallback(async (from: string, to: string, promotion?: string): Promise<{ success: boolean, error?: string, pending?: boolean }> => {
    if (isHostRef.current) {
        const { game, gameState, moves, chatMessages } = gameStateRef.current
        if (!game || !gameState) return { success: false, error: 'Game not found' }
        const result = processMove(game, gameState, { from, to, promotion })
        if (result.success && result.newGameState && result.newMove) {
            const updatedMoves = [...moves, result.newMove]
            setGameState(result.newGameState)
            setMoves(updatedMoves)
            const updatedGame = result.gameUpdate ? { ...game, ...result.gameUpdate } : game
            if (result.gameUpdate) setGame(updatedGame)

            broadcast({
                type: 'SYNC_GAME',
                payload: { game: updatedGame, gameState: result.newGameState, moves: updatedMoves, chatMessages }
            })

            if (updatedGame.status === 'completed') {
              await handleGameCompletion(updatedGame)
            }
            return { success: true }
        }
        return { success: false, error: result.error || 'Invalid move' }
    } else {
        sendToHost({ type: 'MAKE_MOVE', payload: { from, to, promotion } })
        return { success: true, pending: true }
    }
  }, [sendToHost, broadcast, setGame, setGameState, setMoves, handleGameCompletion])

  const resign = useCallback(() => {
     if (isHostRef.current) handleActionAsHost({ action: 'resign', playerId })
     else sendToHost({ type: 'ACTION', payload: { action: 'resign', playerId } })
  }, [playerId, sendToHost, handleActionAsHost])

  const offerDraw = useCallback(() => {
     if (isHostRef.current) broadcast({ type: 'ACTION', payload: { action: 'offer_draw', playerId } })
     else sendToHost({ type: 'ACTION', payload: { action: 'offer_draw', playerId } })
  }, [broadcast, playerId, sendToHost])

  const acceptDraw = useCallback(() => {
     if (isHostRef.current) handleActionAsHost({ action: 'accept_draw', playerId })
     else sendToHost({ type: 'ACTION', payload: { action: 'accept_draw', playerId } })
  }, [handleActionAsHost, playerId, sendToHost])

  const handleTimeout = useCallback((loser: 'white' | 'black') => {
     if (isHostRef.current) handleActionAsHost({ action: 'timeout', playerId, loser })
     else sendToHost({ type: 'ACTION', payload: { action: 'timeout', playerId, loser } })
  }, [handleActionAsHost, playerId, sendToHost])

  const sendChat = useCallback((text: string) => {
    const message: ChatMessage = {
        id: createClientId(),
        senderId: playerId,
        senderName: profile?.username || (playerColor === 'white' ? 'White' : playerColor === 'black' ? 'Black' : 'Spectator'),
        text,
        timestamp: Date.now()
    }

    addChatMessage(message)

    if (isHostRef.current) {
        broadcast({ type: 'CHAT', payload: message })
    } else {
        sendToHost({ type: 'CHAT', payload: message })
    }
  }, [playerId, profile, playerColor, addChatMessage, broadcast, sendToHost])

  return {
    error,
    makeMove,
    joinGame,
    resign,
    offerDraw,
    acceptDraw,
    handleTimeout,
    sendChat
  }
}
