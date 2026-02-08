import { create } from 'zustand'
import { Chess } from 'chess.js'
import type { Game, GameState, Move } from '@/types/database'
import type { PlayerColor } from '@/lib/constants'

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  text: string
  timestamp: number
  isSystem?: boolean
}

const MAX_CHAT_MESSAGES = 200

interface GameStore {
  // Game data
  game: Game | null
  gameState: GameState | null
  moves: Move[]
  chatMessages: ChatMessage[]
  
  // Local state
  chess: Chess
  playerId: string | null
  playerColor: PlayerColor
  boardOrientation: 'white' | 'black'
  
  // UI state
  isConnected: boolean
  isMyTurn: boolean
  selectedSquare: string | null
  lastMoveSquares: { from: string; to: string } | null
  pendingDrawOffer: 'sent' | 'received' | null
  
  // Actions
  setGame: (game: Game | null) => void
  setGameState: (gameState: GameState | null) => void
  setMoves: (moves: Move[]) => void
  addMove: (move: Move) => void
  setChatMessages: (messages: ChatMessage[]) => void
  addChatMessage: (message: ChatMessage) => void
  setPlayerId: (id: string) => void
  setPlayerColor: (color: PlayerColor) => void
  setBoardOrientation: (orientation: 'white' | 'black') => void
  setIsConnected: (connected: boolean) => void
  setSelectedSquare: (square: string | null) => void
  setLastMoveSquares: (squares: { from: string; to: string } | null) => void
  setPendingDrawOffer: (offer: 'sent' | 'received' | null) => void
  
  // Computed
  updateChessFromFen: (fen: string) => void
  resetGame: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Game data
  game: null,
  gameState: null,
  moves: [],
  chatMessages: [],
  
  // Local state
  chess: new Chess(),
  playerId: null,
  playerColor: null,
  boardOrientation: 'white',
  
  // UI state
  isConnected: false,
  isMyTurn: false,
  selectedSquare: null,
  lastMoveSquares: null,
  pendingDrawOffer: null,
  
  // Actions
  setGame: (game) => set({ game }),
  
  setGameState: (gameState) => {
    if (gameState) {
      const chess = new Chess(gameState.fen)
      const { playerColor } = get()
      const isMyTurn = playerColor === (gameState.turn === 'w' ? 'white' : 'black')
      set({ 
        gameState, 
        chess,
        isMyTurn,
        lastMoveSquares: gameState.last_move_from && gameState.last_move_to 
          ? { from: gameState.last_move_from, to: gameState.last_move_to }
          : null
      })
    } else {
      set({ gameState: null })
    }
  },
  
  setMoves: (moves) => set({ moves }),
  
  addMove: (move) => set((state) => ({ moves: [...state.moves, move] })),

  setChatMessages: (messages) => set({ chatMessages: messages.slice(-MAX_CHAT_MESSAGES) }),

  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message].slice(-MAX_CHAT_MESSAGES) })),
  
  setPlayerId: (id) => set({ playerId: id }),
  
  setPlayerColor: (color) => {
    const { gameState } = get()
    const isMyTurn = gameState ? color === (gameState.turn === 'w' ? 'white' : 'black') : false
    set({ 
      playerColor: color, 
      boardOrientation: color || 'white',
      isMyTurn
    })
  },
  
  setBoardOrientation: (orientation) => set({ boardOrientation: orientation }),
  
  setIsConnected: (connected) => set({ isConnected: connected }),
  
  setSelectedSquare: (square) => set({ selectedSquare: square }),
  
  setLastMoveSquares: (squares) => set({ lastMoveSquares: squares }),
  
  setPendingDrawOffer: (offer) => set({ pendingDrawOffer: offer }),
  
  updateChessFromFen: (fen) => {
    const chess = new Chess(fen)
    set({ chess })
  },
  
  resetGame: () => set({
    game: null,
    gameState: null,
    moves: [],
    chatMessages: [],
    chess: new Chess(),
    playerColor: null,
    boardOrientation: 'white',
    isMyTurn: false,
    selectedSquare: null,
    lastMoveSquares: null,
    pendingDrawOffer: null,
  }),
}))
