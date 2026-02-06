'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useGameStore } from '@/store/game-store'
import { getOrCreatePlayerId } from '@/lib/utils/helpers'
import { createInitialGame, processMove, tryJoinGame } from '@/lib/game-logic'
import type { Game, GameState, Move } from '@/types/database'
import Peer, { DataConnection } from 'peerjs'

type Message =
 | { type: 'SYNC_GAME', payload: { game: Game, gameState: GameState, moves: Move[] } }
 | { type: 'JOIN_REQUEST', payload: { playerId: string, color?: 'white' | 'black' } }
 | { type: 'MAKE_MOVE', payload: { from: string, to: string, promotion?: string } }
 | { type: 'ACTION', payload: { action: string, playerId: string } }
 | { type: 'ERROR', payload: string }

export function usePeerGame(
  gameId: string,
  initialOptions?: { timeControl?: string, color?: string }
) {
  const [error, setError] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)

  const {
    game,
    gameState,
    playerId,
    setGame,
    setGameState,
    setMoves,
    addMove,
    setPlayerId,
    setPlayerColor,
    setIsConnected,
    resetGame,
  } = useGameStore()

  const peerRef = useRef<Peer | null>(null)
  const hostConnRef = useRef<DataConnection | null>(null) // Guest's connection to Host
  const guestConnsRef = useRef<Map<string, DataConnection>>(new Map()) // Host's connections to Guests

  // Store state in refs for access inside event handlers without dependencies
  const gameStateRef = useRef<{ game: Game | null, gameState: GameState | null, moves: Move[] }>({
    game: null, gameState: null, moves: []
  })

  // Sync refs with store
  useEffect(() => {
    gameStateRef.current.game = game
    gameStateRef.current.gameState = gameState
  }, [game, gameState])

  // Initialize Player ID
  useEffect(() => {
    const id = getOrCreatePlayerId()
    setPlayerId(id)
  }, [setPlayerId])

  // Cleanup on unmount
  useEffect(() => {
    const conns = guestConnsRef.current
    return () => {
      resetGame()
      if (peerRef.current) {
        peerRef.current.destroy()
        peerRef.current = null
      }
      hostConnRef.current = null
      conns.clear()
    }
  }, [resetGame])

  // Helper to send message to host
  const sendToHost = useCallback((msg: Message) => {
    if (hostConnRef.current && hostConnRef.current.open) {
      hostConnRef.current.send(msg)
    }
  }, [])

  // Helper to broadcast to all guests (Host only)
  const broadcast = useCallback((msg: Message) => {
    guestConnsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send(msg)
      }
    })
  }, [])

  // Sync state to specific guest (Host only)
  const syncStateToGuest = useCallback((conn: DataConnection) => {
    const { game, gameState, moves } = gameStateRef.current
    if (game && gameState) {
      conn.send({
        type: 'SYNC_GAME',
        payload: { game, gameState, moves }
      } as Message)
    }
  }, [])

  // --- Message Handlers ---

  const handleActionAsHost = useCallback((payload: { action: string, playerId: string }) => {
    const { action, playerId: actionPlayerId } = payload
    const { game } = gameStateRef.current
    if (!game) return

    if (action === 'resign') {
        const winner = game.white_player_id === actionPlayerId ? 'black' : 'white'
        const now = new Date().toISOString()
        const updatedGame = {
             ...game,
             status: 'completed',
             result: winner,
             result_reason: 'resignation',
             ended_at: now
        }
        setGame(updatedGame as Game)
        guestConnsRef.current.forEach(c => syncStateToGuest(c))
    }
  }, [setGame, syncStateToGuest])

  const handleMessageAsHost = useCallback((msg: Message, _senderConn: DataConnection) => {
    const { game, gameState } = gameStateRef.current
    if (!game || !gameState) return

    switch (msg.type) {
      case 'JOIN_REQUEST': {
        const { playerId: reqPlayerId, color } = msg.payload
        const result = tryJoinGame(game, reqPlayerId, color)

        if (result.success && result.game) {
          setGame(result.game) // Update store

          // Broadcast update
          guestConnsRef.current.forEach(c => syncStateToGuest(c))
        }
        break
      }

      case 'MAKE_MOVE': {
        const { from, to, promotion } = msg.payload

        const result = processMove(game, gameState, { from, to, promotion })

        if (result.success && result.newGameState && result.newMove) {
          setGameState(result.newGameState)
          addMove(result.newMove)

          if (result.gameUpdate) {
            setGame({ ...game, ...result.gameUpdate })
          }

          // Broadcast
          guestConnsRef.current.forEach(c => syncStateToGuest(c))
        }
        break
      }

      case 'ACTION': {
         handleActionAsHost(msg.payload)
         break
      }
    }
  }, [handleActionAsHost, setGame, setGameState, addMove, syncStateToGuest])

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
    }
  }, [playerId, setGame, setGameState, setMoves, setPlayerColor])


  // Initialize Peer
  useEffect(() => {
    if (!gameId || !playerId || peerRef.current) return

    const initPeer = async () => {
      const peer = new Peer(gameId)

      peer.on('open', (id) => {
        console.log('Opened peer as Host:', id)
        setIsHost(true)
        setIsConnected(true)

        if (initialOptions) {
          const { game: newGame, gameState: newGameState } = createInitialGame(gameId, {
            timeControlName: initialOptions.timeControl || '10+0',
            colorPreference: (initialOptions.color as any) || 'random',
            hostPlayerId: playerId
          })

          setGame(newGame)
          setGameState(newGameState)
          setMoves([])

          if (newGame.white_player_id === playerId) setPlayerColor('white')
          else if (newGame.black_player_id === playerId) setPlayerColor('black')
        }
      })

      peer.on('connection', (conn) => {
        console.log('Host received connection:', conn.peer)
        guestConnsRef.current.set(conn.peer, conn)

        conn.on('open', () => {
          syncStateToGuest(conn)
        })

        conn.on('data', (data: unknown) => {
          handleMessageAsHost(data as Message, conn)
        })

        conn.on('close', () => {
          guestConnsRef.current.delete(conn.peer)
        })
      })

      peer.on('error', (err: unknown) => {
        const peerError = err as { type: string, message: string }
        if (peerError.type === 'unavailable-id') {
          console.log('Game ID taken, joining as Guest')
          peer.destroy()
          joinAsGuest()
        } else {
          console.error('Peer error:', err)
          setError(peerError.message || 'Connection error')
        }
      })

      peerRef.current = peer
    }

    const joinAsGuest = () => {
      const peer = new Peer()

      peer.on('open', (id) => {
        console.log('Opened peer as Guest:', id)
        setIsHost(false)

        const conn = peer.connect(gameId)

        conn.on('open', () => {
          console.log('Connected to Host')
          setIsConnected(true)
          hostConnRef.current = conn
        })

        conn.on('data', (data: unknown) => {
          handleMessageAsGuest(data as Message)
        })

        conn.on('close', () => {
          console.log('Disconnected from Host')
          setIsConnected(false)
          setError('Host disconnected')
        })

        conn.on('error', (err) => {
           console.error('Connection error:', err)
           setError('Failed to connect to host')
        })
      })

      peer.on('error', (err: unknown) => {
         const peerError = err as { type: string, message: string }
         console.error('Peer error:', err)
         setError(peerError.message)
      })

      peerRef.current = peer
    }

    initPeer()
  }, [gameId, playerId, initialOptions, setGame, setGameState, setMoves, setPlayerColor, setIsConnected, syncStateToGuest, handleMessageAsHost, handleMessageAsGuest])


  // --- Public Interface ---

  const joinGame = useCallback(async (color: 'white' | 'black') => {
    if (isHost) {
        const { game } = gameStateRef.current
        if (!game) return { success: false }

        const result = tryJoinGame(game, playerId!, color)
        if (result.success && result.game) {
            setGame(result.game)
            if (result.color) setPlayerColor(result.color)
            broadcast({
                type: 'SYNC_GAME',
                payload: { game: result.game, gameState: gameStateRef.current.gameState!, moves: gameStateRef.current.moves }
            })
            return { success: true }
        }
        return { success: false, error: 'Failed to join' }
    } else {
        sendToHost({
            type: 'JOIN_REQUEST',
            payload: { playerId, color }
        })
        return { success: true }
    }
  }, [isHost, playerId, sendToHost, broadcast, setGame, setPlayerColor])

  const makeMove = useCallback(async (from: string, to: string, promotion?: string) => {
    if (isHost) {
        const { game, gameState } = gameStateRef.current
        if (!game || !gameState) return { success: false }

        const result = processMove(game, gameState, { from, to, promotion })
        if (result.success && result.newGameState && result.newMove) {
            setGameState(result.newGameState)
            addMove(result.newMove)
            if (result.gameUpdate) setGame({ ...game, ...result.gameUpdate })

            broadcast({
                type: 'SYNC_GAME',
                payload: {
                    game: result.gameUpdate ? { ...game, ...result.gameUpdate } : game,
                    gameState: result.newGameState,
                    moves: [...gameStateRef.current.moves, result.newMove]
                }
            })
            return { success: true }
        }
        return { success: false, error: result.error }
    } else {
        sendToHost({
            type: 'MAKE_MOVE',
            payload: { from, to, promotion }
        })
        return { success: true }
    }
  }, [isHost, sendToHost, broadcast, setGame, setGameState, addMove])

  const resign = useCallback(async () => {
     if (isHost) {
         handleActionAsHost({ action: 'resign', playerId: playerId! })
     } else {
         sendToHost({ type: 'ACTION', payload: { action: 'resign', playerId: playerId! } })
     }
  }, [isHost, playerId, sendToHost, handleActionAsHost])

  const offerDraw = useCallback(async () => {
     // Implement draw offer logic
  }, [])

  const acceptDraw = useCallback(async () => {
     // Implement accept draw logic
  }, [])

  const handleTimeout = useCallback(async (_loser: 'white' | 'black') => {
      // similar to resign
  }, [])

  return {
    error,
    makeMove,
    joinGame,
    resign,
    offerDraw,
    acceptDraw,
    handleTimeout
  }
}
