'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useGameStore } from '@/store/game-store'
import { getOrCreatePlayerId } from '@/lib/utils/helpers'
import { createInitialGame, processMove, tryJoinGame } from '@/lib/game-logic'
import type { Game, GameState, Move } from '@/types/database'
import Peer, { DataConnection } from 'peerjs'

const validMessageTypes = new Set(['SYNC_GAME', 'JOIN_REQUEST', 'MAKE_MOVE', 'ACTION', 'ERROR'])

function isValidMessage(data: unknown): data is Message {
  if (!data || typeof data !== 'object') return false
  if (!('type' in data)) return false
  const typeValue = (data as { type?: unknown }).type
  return typeof typeValue === 'string' && validMessageTypes.has(typeValue)
}

type Message =
 | { type: 'SYNC_GAME', payload: { game: Game, gameState: GameState, moves: Move[] } }
 | { type: 'JOIN_REQUEST', payload: { playerId: string, color?: 'white' | 'black' } }
 | { type: 'MAKE_MOVE', payload: { from: string, to: string, promotion?: string } }
 | { type: 'ACTION', payload: { action: 'resign' | 'offer_draw' | 'accept_draw' | 'timeout', playerId: string, loser?: 'white' | 'black' } }
 | { type: 'ERROR', payload: string }

type ActionPayload = Extract<Message, { type: 'ACTION' }>['payload']

export function usePeerGame(
  gameId: string,
  initialOptions?: { timeControl?: string, color?: string }
) {
  const [error, setError] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)

  const {
    game,
    gameState,
    moves,
    playerId,
    setGame,
    setGameState,
    setMoves,
    addMove,
    setPlayerId,
    setPlayerColor,
    setIsConnected,
    setPendingDrawOffer,
    resetGame,
  } = useGameStore()

  const peerRef = useRef<Peer | null>(null)
  const hostConnRef = useRef<DataConnection | null>(null) // Guest's connection to Host
  const guestConnsRef = useRef<Map<string, DataConnection>>(new Map()) // Host's connections to Guests
  const connPlayerMapRef = useRef<Map<string, string>>(new Map())

  // Store state in refs for access inside event handlers without dependencies
  const gameStateRef = useRef<{ game: Game | null, gameState: GameState | null, moves: Move[] }>({
    game: null, gameState: null, moves: []
  })

  // Sync refs with store
  useEffect(() => {
    gameStateRef.current.game = game
    gameStateRef.current.gameState = gameState
    gameStateRef.current.moves = moves
  }, [game, gameState, moves])

  // Initialize Player ID
  useEffect(() => {
    const id = getOrCreatePlayerId()
    setPlayerId(id)
  }, [setPlayerId])

  // Cleanup on unmount
  useEffect(() => {
    const conns = guestConnsRef.current
    const connPlayers = connPlayerMapRef.current
    return () => {
      resetGame()
      if (peerRef.current) {
        peerRef.current.destroy()
        peerRef.current = null
      }
      hostConnRef.current = null
      conns.clear()
      connPlayers.clear()
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

  const broadcastExcept = useCallback((msg: Message, excludedPeerId?: string) => {
    guestConnsRef.current.forEach((conn) => {
      if (conn.peer === excludedPeerId) return
      if (conn.open) {
        conn.send(msg)
      }
    })
  }, [])

  const sendError = useCallback((conn: DataConnection, message: string) => {
    if (conn.open) {
      conn.send({ type: 'ERROR', payload: message })
    }
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

  const buildSyncMessage = useCallback((gameData: Game, gameStateData: GameState, moveList: Move[]): Message => ({
    type: 'SYNC_GAME',
    payload: { game: gameData, gameState: gameStateData, moves: moveList }
  }), [])

  // --- Message Handlers ---

  const handleActionAsHost = useCallback((payload: ActionPayload, senderConn?: DataConnection) => {
    const { action, playerId: actionPlayerId, loser } = payload
    const { game, gameState, moves: currentMoves } = gameStateRef.current
    if (!game || !gameState) return

    if (senderConn) {
      const senderPlayerId = connPlayerMapRef.current.get(senderConn.peer)
      if (senderPlayerId !== actionPlayerId) {
        sendError(senderConn, 'Unauthorized action')
        return
      }
    } else if (actionPlayerId !== playerId) {
      return
    }

    if (action === 'resign') {
      const winner = game.white_player_id === actionPlayerId ? 'black' : 'white'
      const now = new Date().toISOString()
      const updatedGame: Game = {
        ...game,
        status: 'completed',
        result: winner,
        result_reason: 'resignation',
        ended_at: now
      }
      setPendingDrawOffer(null)
      setGame(updatedGame)
      broadcast(buildSyncMessage(updatedGame, gameState, currentMoves))
      return
    }

    if (action === 'offer_draw') {
      if (senderConn) {
        setPendingDrawOffer('received')
        broadcastExcept({ type: 'ACTION', payload: { action: 'offer_draw', playerId: actionPlayerId } }, senderConn.peer)
      } else {
        setPendingDrawOffer('sent')
        broadcast({ type: 'ACTION', payload: { action: 'offer_draw', playerId: actionPlayerId } })
      }
      return
    }

    if (action === 'accept_draw') {
      const now = new Date().toISOString()
      const updatedGame: Game = {
        ...game,
        status: 'completed',
        result: 'draw',
        result_reason: 'agreement',
        ended_at: now
      }
      setPendingDrawOffer(null)
      setGame(updatedGame)
      broadcast(buildSyncMessage(updatedGame, gameState, currentMoves))
      return
    }

    if (action === 'timeout' && loser) {
      const loserPlayerId = loser === 'white' ? game.white_player_id : game.black_player_id
      if (loserPlayerId !== actionPlayerId) {
        if (senderConn) sendError(senderConn, 'Unauthorized timeout')
        return
      }
      const winner = loser === 'white' ? 'black' : 'white'
      const now = new Date().toISOString()
      const updatedGame: Game = {
        ...game,
        status: 'completed',
        result: winner,
        result_reason: 'timeout',
        ended_at: now
      }
      setPendingDrawOffer(null)
      setGame(updatedGame)
      broadcast(buildSyncMessage(updatedGame, gameState, currentMoves))
    }
  }, [broadcast, broadcastExcept, buildSyncMessage, playerId, sendError, setGame, setPendingDrawOffer])

  const handleMessageAsHost = useCallback((msg: Message, senderConn: DataConnection) => {
    const { game, gameState, moves: currentMoves } = gameStateRef.current
    if (!game || !gameState) return

    switch (msg.type) {
      case 'JOIN_REQUEST': {
        const { playerId: reqPlayerId, color } = msg.payload
        const result = tryJoinGame(game, reqPlayerId, color)

        if (result.success && result.game) {
          connPlayerMapRef.current.set(senderConn.peer, reqPlayerId)
          setGame(result.game) // Update store
          broadcast(buildSyncMessage(result.game, gameState, currentMoves))
        }
        break
      }

      case 'MAKE_MOVE': {
        const { from, to, promotion } = msg.payload

        const senderPlayerId = connPlayerMapRef.current.get(senderConn.peer)
        const expectedPlayerId = gameState.turn === 'w' ? game.white_player_id : game.black_player_id
        if (!senderPlayerId || senderPlayerId !== expectedPlayerId) {
          sendError(senderConn, 'Not authorized to move')
          return
        }

        const result = processMove(game, gameState, { from, to, promotion })

        if (result.success && result.newGameState && result.newMove) {
          const updatedMoves = [...currentMoves, result.newMove]
          setGameState(result.newGameState)
          addMove(result.newMove)

          const updatedGame = result.gameUpdate ? { ...game, ...result.gameUpdate } : game
          if (result.gameUpdate) {
            setGame(updatedGame)
          }

          broadcast(buildSyncMessage(updatedGame, result.newGameState, updatedMoves))
        }
        break
      }

      case 'ACTION': {
         handleActionAsHost(msg.payload, senderConn)
         break
      }
    }
  }, [addMove, broadcast, buildSyncMessage, handleActionAsHost, sendError, setGame, setGameState])

  const handleMessageAsGuest = useCallback((msg: Message) => {
    switch (msg.type) {
      case 'SYNC_GAME': {
        const { game: newGame, gameState: newGameState, moves: newMoves } = msg.payload
        setGame(newGame)
        setGameState(newGameState)
        setMoves(newMoves)
        if (newGame.status === 'completed') {
          setPendingDrawOffer(null)
        }

        if (newGame.white_player_id === playerId) setPlayerColor('white')
        else if (newGame.black_player_id === playerId) setPlayerColor('black')
        else setPlayerColor(null)
        break
      }
      case 'ACTION': {
        if (msg.payload.action === 'offer_draw') {
          setPendingDrawOffer('received')
        }
        if (msg.payload.action === 'accept_draw') {
          setPendingDrawOffer(null)
        }
        break
      }
      case 'ERROR': {
        setError(msg.payload)
        break
      }
    }
  }, [playerId, setGame, setGameState, setMoves, setPendingDrawOffer, setPlayerColor])

  const handleMessageAsHostRef = useRef(handleMessageAsHost)
  const handleMessageAsGuestRef = useRef(handleMessageAsGuest)

  useEffect(() => {
    handleMessageAsHostRef.current = handleMessageAsHost
  }, [handleMessageAsHost])

  useEffect(() => {
    handleMessageAsGuestRef.current = handleMessageAsGuest
  }, [handleMessageAsGuest])

  // Initialize Peer
  useEffect(() => {
    if (!gameId || !playerId || peerRef.current) return

    const initPeer = async () => {
      const peerOptions: ConstructorParameters<typeof Peer>[1] = {}
      if (process.env.NEXT_PUBLIC_PEERJS_HOST) {
        peerOptions.host = process.env.NEXT_PUBLIC_PEERJS_HOST
      }
      if (process.env.NEXT_PUBLIC_PEERJS_PATH) {
        peerOptions.path = process.env.NEXT_PUBLIC_PEERJS_PATH
      }
      if (process.env.NEXT_PUBLIC_PEERJS_PORT) {
        peerOptions.port = Number(process.env.NEXT_PUBLIC_PEERJS_PORT)
      }

      const peer = new Peer(gameId, Object.keys(peerOptions).length ? peerOptions : undefined)

      peer.on('open', (id) => {
        console.log('Opened peer as Host:', id)
        setIsHost(true)
        setIsConnected(true)

        if (initialOptions) {
          const { game: newGame, gameState: newGameState } = createInitialGame(gameId, {
            timeControlName: initialOptions.timeControl || '10+0',
            colorPreference: (initialOptions.color as 'white' | 'black' | 'random') || 'random',
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
          if (!isValidMessage(data)) {
            console.warn('Invalid message received from guest', data)
            return
          }
          handleMessageAsHostRef.current(data, conn)
        })

        conn.on('close', () => {
          guestConnsRef.current.delete(conn.peer)
          connPlayerMapRef.current.delete(conn.peer)
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
      const peerOptions: ConstructorParameters<typeof Peer>[1] = {}
      if (process.env.NEXT_PUBLIC_PEERJS_HOST) {
        peerOptions.host = process.env.NEXT_PUBLIC_PEERJS_HOST
      }
      if (process.env.NEXT_PUBLIC_PEERJS_PATH) {
        peerOptions.path = process.env.NEXT_PUBLIC_PEERJS_PATH
      }
      if (process.env.NEXT_PUBLIC_PEERJS_PORT) {
        peerOptions.port = Number(process.env.NEXT_PUBLIC_PEERJS_PORT)
      }

      const peer = Object.keys(peerOptions).length ? new Peer(peerOptions) : new Peer()

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
          if (!isValidMessage(data)) {
            console.warn('Invalid message received from host', data)
            return
          }
          handleMessageAsGuestRef.current(data)
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
  }, [gameId, playerId, initialOptions, setGame, setGameState, setMoves, setPlayerColor, setIsConnected, syncStateToGuest])


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
        if (!playerId) return { success: false, error: 'Player ID not initialized' }
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
     if (!playerId) return
     setPendingDrawOffer('sent')
     if (isHost) {
       broadcast({ type: 'ACTION', payload: { action: 'offer_draw', playerId } })
     } else {
       sendToHost({ type: 'ACTION', payload: { action: 'offer_draw', playerId } })
     }
  }, [broadcast, isHost, playerId, sendToHost, setPendingDrawOffer])

  const acceptDraw = useCallback(async () => {
     if (!playerId) return
     if (isHost) {
       handleActionAsHost({ action: 'accept_draw', playerId })
     } else {
       sendToHost({ type: 'ACTION', payload: { action: 'accept_draw', playerId } })
     }
  }, [handleActionAsHost, isHost, playerId, sendToHost])

  const handleTimeout = useCallback(async (loser: 'white' | 'black') => {
     if (!playerId) return
     if (isHost) {
       handleActionAsHost({ action: 'timeout', playerId, loser })
     } else {
       sendToHost({ type: 'ACTION', payload: { action: 'timeout', playerId, loser } })
     }
  }, [handleActionAsHost, isHost, playerId, sendToHost])

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
