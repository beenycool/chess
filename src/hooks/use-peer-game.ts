'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { DataConnection, Peer as PeerType } from 'peerjs'
import {
  createInitialGame,
  processMove,
  tryJoinGame
} from '@/lib/game-logic'
import { useGameStore } from '@/store/game-store'
import type { Game, GameState, Move } from '@/types/database'
import { useAuth } from '@/hooks/use-auth'
import { recordGameResult } from '@/lib/game-results'
import { createBrowserSupabase } from '@/lib/supabase'

type Message =
  | { type: 'SYNC_GAME', payload: { game: Game, gameState: GameState, moves: Move[] } }
  | { type: 'JOIN_REQUEST', payload: { playerId: string, color: 'white' | 'black', profileId?: string } }
  | { type: 'MAKE_MOVE', payload: { from: string, to: string, promotion?: string } }
  | { type: 'ACTION', payload: { action: string, playerId: string, loser?: 'white' | 'black' } }
  | { type: 'ERROR', payload: string }
  | { type: 'CHAT', payload: { sender: string; text: string; timestamp: number } }

export function usePeerGame(gameId: string, initialOptions?: { timeControl?: string, color?: string }) {
  const { profile } = useAuth()
  const [playerId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('chess_player_id')
      if (stored) return stored
      const newId = Math.random().toString(36).substring(2, 15)
      localStorage.setItem('chess_player_id', newId)
      return newId
    }
    return Math.random().toString(36).substring(2, 15)
  })
  const supabase = createBrowserSupabase()

  const {
    setGame,
    setGameState,
    setMoves,
    setPlayerColor,
    setIsConnected,
    game: gameStore,
    gameState: gameStateStore,
    moves: movesStore,
    addChatMessage,
  } = useGameStore()

  const [isHost, setIsHost] = useState(false)
  const isHostRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const peerRef = useRef<PeerType | null>(null)
  const hostConnRef = useRef<DataConnection | null>(null)
  const guestConnsRef = useRef<Map<string, DataConnection>>(new Map())

  const gameStateRef = useRef({ game: gameStore, gameState: gameStateStore, moves: movesStore })
  useEffect(() => {
    gameStateRef.current = { game: gameStore, gameState: gameStateStore, moves: movesStore }
  }, [gameStore, gameStateStore, movesStore])

  useEffect(() => {
    isHostRef.current = isHost
  }, [isHost])

  // --- Utilities ---

  const broadcast = useCallback((msg: Message) => {
    guestConnsRef.current.forEach(conn => {
      if (conn.open) conn.send(msg)
    })
  }, [])

  const sendToHost = useCallback((msg: Message) => {
    if (hostConnRef.current?.open) {
      hostConnRef.current.send(msg)
    }
  }, [])

  const sendError = useCallback((conn: DataConnection, message: string) => {
    conn.send({ type: 'ERROR', payload: message })
  }, [])

  const syncStateToGuest = useCallback((conn: DataConnection) => {
    const { game, gameState, moves } = gameStateRef.current
    if (game && gameState) {
      conn.send({
        type: 'SYNC_GAME',
        payload: { game, gameState, moves }
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
  }, [])

  const publishGameToSupabase = useCallback(async (game: Game) => {
    if (!isHostRef.current) return
    const { error: supabaseError } = await supabase.from('games').upsert({
      id: game.id,
      status: game.status,
      time_control: game.time_control,
      white_id: game.white_id,
      black_id: game.black_id,
      white_player_id: game.white_player_id,
      black_player_id: game.black_player_id,
      initial_time_ms: game.initial_time_ms,
      increment_ms: game.increment_ms,
    })
    if (supabaseError) console.error('Error publishing game to Supabase', supabaseError)
  }, [supabase])

  // --- Handlers ---

  const handleActionAsHost = useCallback(async (payload: { action: string, playerId: string, loser?: 'white' | 'black' }) => {
    const { game, gameState, moves } = gameStateRef.current
    if (!game || !gameState) return

    let updatedGame = { ...game }
    const now = new Date().toISOString()

    switch (payload.action) {
      case 'resign': {
        const isWhite = payload.playerId === game.white_player_id
        updatedGame = {
          ...game,
          status: 'completed',
          result: isWhite ? 'black' : 'white',
          result_reason: 'resignation',
          ended_at: now
        }
        break
      }
      case 'offer_draw': {
        broadcast({ type: 'ACTION', payload })
        return
      }
      case 'accept_draw': {
        updatedGame = {
          ...game,
          status: 'completed',
          result: 'draw',
          result_reason: 'agreement',
          ended_at: now
        }
        break
      }
      case 'timeout': {
        updatedGame = {
          ...game,
          status: 'completed',
          result: payload.loser === 'white' ? 'black' : 'white',
          result_reason: 'timeout',
          ended_at: now
        }
        break
      }
    }

    setGame(updatedGame)
    broadcast({ type: 'SYNC_GAME', payload: { game: updatedGame, gameState, moves } })

    if (updatedGame.status === 'completed') {
      await handleGameCompletion(updatedGame)
    } else {
      await publishGameToSupabase(updatedGame)
    }
  }, [broadcast, setGame, handleGameCompletion, publishGameToSupabase])

  const isValidMessage = (data: unknown): data is Message => {
    if (!data || typeof data !== 'object') return false
    const msg = data as Record<string, any>
    if (typeof msg.type !== 'string') return false

    // Basic payload check
    if (!msg.payload) return false

    // Specific payload validation could go here
    if (msg.type === 'MAKE_MOVE') {
      return typeof msg.payload.from === 'string' && typeof msg.payload.to === 'string'
    }

    return true
  }

  const handleMessageAsHost = useCallback(async (msg: Message, senderConn: DataConnection) => {
    switch (msg.type) {
      case 'JOIN_REQUEST': {
        const { game } = gameStateRef.current
        if (!game) return

        const result = tryJoinGame(game, msg.payload.playerId, msg.payload.color)
        if (result.success && result.game) {
          const updatedGame = { ...result.game }

          // Use result.color to correctly assign ID
          if (result.color === 'white') updatedGame.white_id = msg.payload.profileId || null
          else if (result.color === 'black') updatedGame.black_id = msg.payload.profileId || null

          setGame(updatedGame)
          broadcast({
            type: 'SYNC_GAME',
            payload: { game: updatedGame, gameState: gameStateRef.current.gameState!, moves: gameStateRef.current.moves }
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
            payload: { game: updatedGame, gameState: result.newGameState, moves: updatedMoves }
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
         broadcast(msg)
         break
      }
    }
  }, [broadcast, handleActionAsHost, sendError, setGame, setGameState, setMoves, handleGameCompletion, publishGameToSupabase])

  const handleMessageAsGuest = useCallback((msg: Message) => {
    switch (msg.type) {
      case 'SYNC_GAME': {
        const { game: newGame, gameState: newGameState, moves: newMoves } = msg.payload
        setGame(newGame)
        setGameState(newGameState)
        setMoves(newMoves)

        if (newGame.white_player_id === playerId) setPlayerColor('white')
        else if (newGame.black_player_id === playerId) setPlayerColor('black')
        else setPlayerColor(null)
        break
      }
      case 'ACTION': {
        break
      }
      case 'ERROR': {
        setError(msg.payload)
        break
      }
    }
  }, [playerId, setGame, setGameState, setMoves, setPlayerColor])

  useEffect(() => {
    if (!gameId || !playerId || peerRef.current) return

    const initPeer = async () => {
      const { default: Peer } = await import('peerjs')
      const peer = new Peer(gameId)

      peer.on('open', async () => {
        setIsHost(true)
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

      peer.on('error', (err: { type: string, message: string }) => {
        if (err.type === 'unavailable-id') {
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
        setIsHost(false)
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
  }, [gameId, playerId, initialOptions, profile, setGame, setGameState, setMoves, setPlayerColor, setIsConnected, syncStateToGuest, handleMessageAsHost, handleMessageAsGuest, publishGameToSupabase])

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
            broadcast({
                type: 'SYNC_GAME',
                payload: { game: updatedGame, gameState: gameStateRef.current.gameState!, moves: gameStateRef.current.moves }
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
        const { game, gameState, moves } = gameStateRef.current
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
                payload: { game: updatedGame, gameState: result.newGameState, moves: updatedMoves }
            })

            if (updatedGame.status === 'completed') {
              await handleGameCompletion(updatedGame)
            }

  return { success: true }
        }

  return { success: false, error: result.error || 'Invalid move' }
    } else {
        sendToHost({ type: 'MAKE_MOVE', payload: { from, to, promotion } })
        // Return pending status for guest

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
    const message = {
      sender: profile?.username || (playerColor ? (playerColor === 'white' ? 'White' : 'Black') : 'Spectator'),
      text,
      timestamp: Date.now()
    }

    // Add locally first
    addChatMessage(message)

    if (isHostRef.current) {
       broadcast({ type: 'CHAT', payload: message })
    } else {
       sendToHost({ type: 'CHAT', payload: message })
    }
  }, [profile, playerColor, broadcast, sendToHost, addChatMessage])

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
