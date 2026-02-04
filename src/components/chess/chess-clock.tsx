'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useGameStore } from '@/store/game-store'
import { formatTimeWithTenths } from '@/lib/utils/helpers'
import { cn } from '@/lib/utils'

interface ChessClockProps {
  color: 'white' | 'black'
  onTimeout?: () => void
}

export function ChessClock({ color, onTimeout }: ChessClockProps) {
  const { gameState, game, playerColor } = useGameStore()
  const [displayTime, setDisplayTime] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasCalledTimeout = useRef(false)

  const initialTime = color === 'white' ? gameState?.white_time_ms : gameState?.black_time_ms
  const isMyTurn = gameState?.turn === (color === 'white' ? 'w' : 'b')
  const isGameActive = game?.status === 'active'
  const isLowTime = displayTime < 30000 // Less than 30 seconds

  useEffect(() => {
    if (!gameState || !isGameActive) {
      setDisplayTime(initialTime || 0)
      return
    }

    if (isMyTurn && gameState.last_move_at) {
      // Calculate time elapsed since last move
      const elapsed = Date.now() - new Date(gameState.last_move_at).getTime()
      const remaining = Math.max(0, (initialTime || 0) - elapsed)
      setDisplayTime(remaining)

      // Start countdown
      intervalRef.current = setInterval(() => {
        setDisplayTime((prev) => {
          const newTime = Math.max(0, prev - 100)
          if (newTime === 0 && !hasCalledTimeout.current) {
            hasCalledTimeout.current = true
            onTimeout?.()
          }
          return newTime
        })
      }, 100)
    } else {
      setDisplayTime(initialTime || 0)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [gameState, initialTime, isMyTurn, isGameActive, onTimeout])

  // Reset timeout flag when game state changes
  useEffect(() => {
    hasCalledTimeout.current = false
  }, [gameState?.move_index])

  const isPlayerClock = playerColor === color

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-lg px-4 py-2 font-mono text-2xl font-bold transition-colors min-w-[120px]',
        isMyTurn && isGameActive
          ? 'bg-green-600 text-white'
          : 'bg-slate-700 text-slate-300',
        isLowTime && isMyTurn && isGameActive && 'bg-red-600 animate-pulse',
        isPlayerClock && 'ring-2 ring-blue-500'
      )}
    >
      {formatTimeWithTenths(displayTime)}
    </div>
  )
}
