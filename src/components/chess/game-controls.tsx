'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useGameStore } from '@/store/game-store'
import { copyToClipboard } from '@/lib/utils/helpers'
import { toast } from 'sonner'
import { useState } from 'react'

interface GameControlsProps {
  onResign: () => void
  onOfferDraw: () => void
  onAcceptDraw: () => void
}

export function GameControls({ onResign, onOfferDraw, onAcceptDraw }: GameControlsProps) {
  const { game, gameState, playerColor, pendingDrawOffer, chess } = useGameStore()
  const [showResignDialog, setShowResignDialog] = useState(false)
  const [showDrawDialog, setShowDrawDialog] = useState(false)

  const isGameActive = game?.status === 'active'
  const isPlayer = playerColor !== null

  const handleCopyPGN = async () => {
    if (gameState?.pgn) {
      await copyToClipboard(gameState.pgn)
      toast.success('PGN copied to clipboard')
    }
  }

  const handleCopyFEN = async () => {
    if (gameState?.fen) {
      await copyToClipboard(gameState.fen)
      toast.success('FEN copied to clipboard')
    }
  }

  const handleExportPGN = () => {
    if (!gameState?.pgn) return
    
    const headers = [
      '[Event "Casual Game"]',
      `[Date "${new Date().toISOString().split('T')[0]}"]`,
      `[White "Player 1"]`,
      `[Black "Player 2"]`,
      `[Result "${game?.result === 'white' ? '1-0' : game?.result === 'black' ? '0-1' : game?.result === 'draw' ? '1/2-1/2' : '*'}"]`,
      `[TimeControl "${game?.time_control}"]`,
    ].join('\n')

    const fullPgn = `${headers}\n\n${gameState.pgn}`
    
    const blob = new Blob([fullPgn], { type: 'application/x-chess-pgn' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `game-${game?.id}.pgn`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    toast.success('PGN file downloaded')
  }

  return (
    <div className="flex flex-col gap-2">
      {isGameActive && isPlayer && (
        <>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowResignDialog(true)}
              className="flex-1"
            >
              Resign
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDrawDialog(true)}
              disabled={pendingDrawOffer === 'sent'}
              className="flex-1"
            >
              {pendingDrawOffer === 'sent' ? 'Draw Offered' : 'Offer Draw'}
            </Button>
          </div>
        </>
      )}

      {pendingDrawOffer === 'received' && (
        <div className="flex gap-2 p-2 bg-yellow-900/50 rounded-lg">
          <span className="text-sm text-yellow-200 flex-1">Draw offered</span>
          <Button size="sm" variant="secondary" onClick={onAcceptDraw}>
            Accept
          </Button>
          <Button size="sm" variant="ghost" onClick={() => useGameStore.setState({ pendingDrawOffer: null })}>
            Decline
          </Button>
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <Button variant="outline" size="sm" onClick={handleCopyFEN} className="flex-1">
          Copy FEN
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopyPGN} className="flex-1">
          Copy PGN
        </Button>
      </div>
      
      <Button variant="outline" size="sm" onClick={handleExportPGN}>
        Download PGN
      </Button>

      {/* Resign Dialog */}
      <Dialog open={showResignDialog} onOpenChange={setShowResignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resign Game?</DialogTitle>
            <DialogDescription>
              Are you sure you want to resign? Your opponent will win the game.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowResignDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onResign()
                setShowResignDialog(false)
              }}
            >
              Resign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Draw Dialog */}
      <Dialog open={showDrawDialog} onOpenChange={setShowDrawDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Offer Draw?</DialogTitle>
            <DialogDescription>
              Do you want to offer a draw to your opponent?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDrawDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onOfferDraw()
                setShowDrawDialog(false)
              }}
            >
              Offer Draw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
