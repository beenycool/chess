'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useGameStore } from '@/store/game-store'
import { Chess } from 'chess.js'
import type { Game, GameState, Move } from '@/types/database'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useGameRealtime(gameId: string | null) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const {
    setGame,
    setGameState,
    setMoves,
    addMove,
    setIsConnected,
    playerId,
    setPlayerColor,
    game,
    gameState,
  } = useGameStore()

  // Fetch initial game data
  const fetchGameData = useCallback(async () => {
    if (!gameId) return
    
    try {
      // Fetch game
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()
      
      if (gameError) throw gameError
      const game = gameData as Game
      setGame(game)
      
      // Determine player color
      if (game.white_player_id === playerId) {
        setPlayerColor('white')
      } else if (game.black_player_id === playerId) {
        setPlayerColor('black')
      } else {
        setPlayerColor(null) // Spectator
      }
      
      // Fetch game state
      const { data: stateData, error: stateError } = await supabase
        .from('game_states')
        .select('*')
        .eq('game_id', gameId)
        .single()
      
      if (stateError) throw stateError
      setGameState(stateData)
      
      // Fetch moves
      const { data: movesData, error: movesError } = await supabase
        .from('moves')
        .select('*')
        .eq('game_id', gameId)
        .order('move_index', { ascending: true })
      
      if (movesError) throw movesError
      setMoves(movesData || [])
      
    } catch (err) {
      console.error('Error fetching game data:', err)
      setError('Failed to load game')
    }
  }, [gameId, playerId, setGame, setGameState, setMoves, setPlayerColor])

  // Subscribe to realtime updates
  useEffect(() => {
    if (!gameId) return
    
    fetchGameData()
    
    // Subscribe to game_states changes
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_states',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const newState = payload.new as GameState
            setGameState(newState)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          setGame(payload.new as any)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'moves',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          addMove(payload.new as any)
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })
    
    channelRef.current = channel
    
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [gameId, fetchGameData, setGame, setGameState, addMove, setIsConnected])

  // Make a move
  const makeMove = useCallback(async (from: string, to: string, promotion?: string) => {
    if (!gameId || !gameState || !playerId) return { success: false, error: 'Not ready' }
    
    const chess = new Chess(gameState.fen)
    
    try {
      const move = chess.move({ from, to, promotion })
      if (!move) return { success: false, error: 'Invalid move' }
      
      const now = new Date().toISOString()
      const isWhite = gameState.turn === 'w'
      const timeSinceLastMove = gameState.last_move_at 
        ? Date.now() - new Date(gameState.last_move_at).getTime()
        : 0
      
      // Calculate new times
      let newWhiteTime = gameState.white_time_ms
      let newBlackTime = gameState.black_time_ms
      
      if (gameState.move_index > 0) { // Don't deduct time for first move
        if (isWhite) {
          newWhiteTime = Math.max(0, gameState.white_time_ms - timeSinceLastMove)
          // Add increment after move
          const { data: incrementData } = await supabase
            .from('games')
            .select('increment_ms')
            .eq('id', gameId)
            .single()
          if (incrementData) {
            newWhiteTime += (incrementData as { increment_ms: number }).increment_ms
          }
        } else {
          newBlackTime = Math.max(0, gameState.black_time_ms - timeSinceLastMove)
          const { data: incrementData } = await supabase
            .from('games')
            .select('increment_ms')
            .eq('id', gameId)
            .single()
          if (incrementData) {
            newBlackTime += (incrementData as { increment_ms: number }).increment_ms
          }
        }
      }
      
      // Check for game end conditions
      let isCheckmate = chess.isCheckmate()
      let isStalemate = chess.isStalemate()
      let isDraw = chess.isDraw()
      let drawReason: string | null = null
      
      if (isDraw && !isStalemate) {
        if (chess.isThreefoldRepetition()) drawReason = 'threefold'
        else if (chess.isInsufficientMaterial()) drawReason = 'insufficient'
        else drawReason = 'fifty_move'
      }
      
      // Update game state
      const { error: stateError } = await supabase
        .from('game_states')
        .update({
          fen: chess.fen(),
          pgn: chess.pgn(),
          move_index: gameState.move_index + 1,
          turn: chess.turn(),
          white_time_ms: newWhiteTime,
          black_time_ms: newBlackTime,
          last_move_at: now,
          is_check: chess.isCheck(),
          is_checkmate: isCheckmate,
          is_stalemate: isStalemate,
          is_draw: isDraw,
          draw_reason: drawReason,
          last_move_san: move.san,
          last_move_from: from,
          last_move_to: to,
          updated_at: now,
        })
        .eq('game_id', gameId)
      
      if (stateError) throw stateError
      
      // Insert move record
      const { error: moveError } = await supabase
        .from('moves')
        .insert({
          game_id: gameId,
          move_index: gameState.move_index + 1,
          san: move.san,
          uci: `${from}${to}${promotion || ''}`,
          fen_after: chess.fen(),
          played_by: isWhite ? 'white' : 'black',
          time_remaining_ms: isWhite ? newWhiteTime : newBlackTime,
        })
      
      if (moveError) throw moveError
      
      // Update game if ended
      if (isCheckmate || isStalemate || isDraw) {
        let result: string | null = null
        let resultReason: string | null = null
        
        if (isCheckmate) {
          result = isWhite ? 'white' : 'black' // Current player wins
          resultReason = 'checkmate'
        } else if (isStalemate) {
          result = 'draw'
          resultReason = 'stalemate'
        } else if (isDraw) {
          result = 'draw'
          resultReason = drawReason
        }
        
        await supabase
          .from('games')
          .update({
            status: 'completed',
            result,
            result_reason: resultReason,
            ended_at: now,
          })
          .eq('id', gameId)
      }
      
      return { success: true }
    } catch (err) {
      console.error('Error making move:', err)
      return { success: false, error: 'Failed to make move' }
    }
  }, [gameId, gameState, playerId])

  // Join game as player
  const joinGame = useCallback(async (color: 'white' | 'black') => {
    if (!gameId || !playerId) return { success: false, error: 'Not ready' }
    
    const column = color === 'white' ? 'white_player_id' : 'black_player_id'
    
    const { error } = await supabase
      .from('games')
      .update({ [column]: playerId })
      .eq('id', gameId)
      .is(column, null)
    
    if (error) {
      return { success: false, error: 'Failed to join game or spot taken' }
    }
    
    setPlayerColor(color)
    
    // Check if both players have joined to start the game
    const { data: gameData } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()
    
    const fetchedGame = gameData as Game | null
    if (fetchedGame && fetchedGame.white_player_id && fetchedGame.black_player_id && fetchedGame.status === 'waiting') {
      await supabase
        .from('games')
        .update({ 
          status: 'active',
          started_at: new Date().toISOString()
        })
        .eq('id', gameId)
      
      await supabase
        .from('game_states')
        .update({
          last_move_at: new Date().toISOString()
        })
        .eq('game_id', gameId)
    }
    
    return { success: true }
  }, [gameId, playerId, setPlayerColor])

  // Resign
  const resign = useCallback(async () => {
    if (!gameId || !playerId) return
    
    const { playerColor } = useGameStore.getState()
    if (!playerColor) return
    
    const winner = playerColor === 'white' ? 'black' : 'white'
    
    await supabase
      .from('games')
      .update({
        status: 'completed',
        result: winner,
        result_reason: 'resignation',
        ended_at: new Date().toISOString(),
      })
      .eq('id', gameId)
  }, [gameId, playerId])

  // Offer draw
  const offerDraw = useCallback(async () => {
    // For simplicity, we'll use a broadcast channel for draw offers
    if (!channelRef.current) return
    
    channelRef.current.send({
      type: 'broadcast',
      event: 'draw_offer',
      payload: { from: playerId }
    })
  }, [playerId])

  // Accept draw
  const acceptDraw = useCallback(async () => {
    if (!gameId) return
    
    await supabase
      .from('games')
      .update({
        status: 'completed',
        result: 'draw',
        result_reason: 'draw_agreement',
        ended_at: new Date().toISOString(),
      })
      .eq('id', gameId)
  }, [gameId])

  // Handle timeout
  const handleTimeout = useCallback(async (loser: 'white' | 'black') => {
    if (!gameId) return
    
    const winner = loser === 'white' ? 'black' : 'white'
    
    await supabase
      .from('games')
      .update({
        status: 'completed',
        result: winner,
        result_reason: 'timeout',
        ended_at: new Date().toISOString(),
      })
      .eq('id', gameId)
  }, [gameId])

  return {
    error,
    makeMove,
    joinGame,
    resign,
    offerDraw,
    acceptDraw,
    handleTimeout,
    refetch: fetchGameData,
  }
}
