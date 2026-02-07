'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/store/game-store'
import { useRouter } from 'next/navigation'

interface GameOverDialogProps {
  open: boolean
  onRematch?: () => void
}

export function GameOverDialog({ open, onRematch }: GameOverDialogProps) {
  const router = useRouter()
  const { game, playerColor } = useGameStore()

  if (!game || game.status !== 'completed') return null

  const getResultText = () => {
    if (game.result === 'draw') {
      return 'Draw'
    }
    
    const winner = game.result === 'white' ? 'White' : 'Black'
    
    if (playerColor) {
      if (game.result === playerColor) {
        return 'You Won!'
      } else {
        return 'You Lost'
      }
    }
    
    return `${winner} Wins`
  }

  const getReasonText = () => {
    switch (game.result_reason) {
      case 'checkmate':
        return 'by checkmate'
      case 'timeout':
        return 'on time'
      case 'resignation':
        return 'by resignation'
      case 'stalemate':
        return 'by stalemate'
      case 'draw_agreement':
        return 'by agreement'
      case 'insufficient':
        return 'insufficient material'
      case 'threefold':
        return 'threefold repetition'
      case 'fifty_move':
        return 'fifty-move rule'
      default:
        return ''
    }
  }

  const isWinner = playerColor && game.result === playerColor
  const isDraw = game.result === 'draw'

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={`text-2xl text-center ${isWinner ? 'text-green-500' : isDraw ? 'text-yellow-500' : 'text-red-500'}`}>
            {getResultText()}
          </DialogTitle>
          <DialogDescription className="text-center text-lg">
            {getReasonText()}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-4">
          <Button onClick={() => router.push('/')} variant="default">
            New Game
          </Button>
          <Button onClick={() => router.push('/profile')} variant="outline">
            View My Profile & History
          </Button>
          {onRematch && (
            <Button onClick={onRematch} variant="secondary">
              Rematch
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
