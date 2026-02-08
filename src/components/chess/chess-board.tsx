'use client'

import { Chessboard } from 'react-chessboard'
import { useGameStore } from '@/store/game-store'
import { Square } from 'chess.js'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'

interface ChessBoardProps {
  onMove: (from: string, to: string, promotion?: string) => Promise<{ success: boolean; error?: string }>
  disabled?: boolean
}

export function ChessBoard({ onMove, disabled = false }: ChessBoardProps) {
  const { 
    chess, 
    boardOrientation, 
    isMyTurn, 
    lastMoveSquares,
    gameState,
    game,
    playerColor,
    moves
  } = useGameStore()
  
  const [moveFrom, setMoveFrom] = useState<string | null>(null)
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({})

  const isGameActive = game?.status === 'active'
  const canMove = isGameActive && isMyTurn && !disabled && playerColor !== null
  const prevMovesLenRef = useRef(moves.length)

  // Sound effects
  useEffect(() => {
    if (moves.length > prevMovesLenRef.current) {
      const lastMove = moves[moves.length - 1]
      let soundFile = '/move.mp3'

      if (lastMove.san.includes('#')) {
        soundFile = '/game-end.mp3'
      } else if (lastMove.san.includes('+')) {
        soundFile = '/check.mp3'
      } else if (lastMove.san.includes('x')) {
        soundFile = '/capture.mp3'
      }

      const audio = new Audio(soundFile)
      audio.play().catch(() => {})
    }
    prevMovesLenRef.current = moves.length
  }, [moves.length])

  // Highlight squares for last move and selected piece options
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {}
    
    // Highlight last move
    if (lastMoveSquares) {
      styles[lastMoveSquares.from] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' }
      styles[lastMoveSquares.to] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' }
    }
    
    // Highlight check
    if (gameState?.is_check) {
      const kingSquare = findKingSquare(chess.fen(), chess.turn())
      if (kingSquare) {
        styles[kingSquare] = { 
          backgroundColor: 'rgba(255, 0, 0, 0.5)',
          boxShadow: 'inset 0 0 10px rgba(255, 0, 0, 0.8)'
        }
      }
    }
    
    return { ...styles, ...optionSquares }
  }, [lastMoveSquares, gameState?.is_check, chess, optionSquares])

  function findKingSquare(fen: string, turn: 'w' | 'b'): string | null {
    const board = chess.board()
    
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col]
        if (piece && piece.type === 'k' && piece.color === turn) {
          const files = 'abcdefgh'
          return `${files[col]}${8 - row}`
        }
      }
    }
    return null
  }

  const getMoveOptions = useCallback((square: Square) => {
    const moves = chess.moves({ square, verbose: true })
    if (moves.length === 0) {
      setOptionSquares({})
      return false
    }

    const newSquares: Record<string, React.CSSProperties> = {}
    moves.forEach((move) => {
      newSquares[move.to] = {
        background: chess.get(move.to as Square)
          ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
        borderRadius: '50%',
      }
    })
    newSquares[square] = {
      background: 'rgba(255, 255, 0, 0.4)',
    }
    setOptionSquares(newSquares)
    return true
  }, [chess])

  const handleSquareClick = useCallback(({ square }: { piece: { pieceType: string } | null; square: string }) => {
    if (!canMove) return

    // If no piece selected, try to select this square
    if (!moveFrom) {
      const piece = chess.get(square as Square)
      if (piece && piece.color === chess.turn()) {
        getMoveOptions(square as Square)
        setMoveFrom(square)
      }
      return
    }

    // If same square clicked, deselect
    if (moveFrom === square) {
      setMoveFrom(null)
      setOptionSquares({})
      return
    }

    // Try to make the move
    const moves = chess.moves({ square: moveFrom as Square, verbose: true })
    const foundMove = moves.find(m => m.to === square)

    if (!foundMove) {
      // Check if clicking on own piece to select it instead
      const piece = chess.get(square as Square)
      if (piece && piece.color === chess.turn()) {
        getMoveOptions(square as Square)
        setMoveFrom(square)
      } else {
        setMoveFrom(null)
        setOptionSquares({})
      }
      return
    }

    // Check for promotion - auto-queen for simplicity
    let promotion: string | undefined
    if (foundMove.flags.includes('p')) {
      promotion = 'q'
    }

    // Make the move
    onMove(moveFrom, square, promotion)
    setMoveFrom(null)
    setOptionSquares({})
  }, [canMove, chess, moveFrom, getMoveOptions, onMove])

  const handlePieceDrop = useCallback(({ piece, sourceSquare, targetSquare }: {
    piece: { isSparePiece: boolean; position: string; pieceType: string }
    sourceSquare: string
    targetSquare: string | null
  }) => {
    if (!canMove || !targetSquare) return false

    const moves = chess.moves({ square: sourceSquare as Square, verbose: true })
    const foundMove = moves.find(m => m.to === targetSquare)

    if (!foundMove) return false

    // Check for promotion - auto-queen for simplicity
    let promotion: string | undefined
    if (foundMove.flags.includes('p')) {
      promotion = 'q'
    }

    onMove(sourceSquare, targetSquare, promotion)
    setMoveFrom(null)
    setOptionSquares({})
    return true
  }, [canMove, chess, onMove])

  // Convert FEN to position object for react-chessboard
  const getPositionFromFen = (fen: string): Record<string, { pieceType: string }> => {
    const position: Record<string, { pieceType: string }> = {}
    const board = chess.board()
    const files = 'abcdefgh'
    
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col]
        if (piece) {
          const square = `${files[col]}${8 - row}`
          const pieceChar = piece.color === 'w' 
            ? piece.type.toUpperCase() 
            : piece.type.toLowerCase()
          position[square] = { pieceType: pieceChar }
        }
      }
    }
    return position
  }

  return (
    <div className="w-full max-w-[600px] aspect-square">
      <Chessboard
        options={{
          position: chess.fen(),
          boardOrientation,
          squareStyles: customSquareStyles,
          onSquareClick: handleSquareClick,
          onPieceDrop: handlePieceDrop,
          allowDragging: canMove,
          boardStyle: {
            borderRadius: '4px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          },
          darkSquareStyle: { backgroundColor: '#779952' },
          lightSquareStyle: { backgroundColor: '#edeed1' },
        }}
      />
    </div>
  )
}
