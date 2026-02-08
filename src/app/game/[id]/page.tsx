'use client'

import { useCallback, useMemo } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  ChessBoard, 
  ChessClock, 
  MoveHistory, 
  GameControls,
  GameOverDialog,
  ChatBox
} from '@/components/chess'
import { useGameStore } from '@/store/game-store'
import { usePeerGame } from '@/hooks/use-peer-game'
import { copyToClipboard } from '@/lib/utils/helpers'
import { toast } from 'sonner'

export default function GamePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const gameId = params.id as string
  
  const storedOptions = useMemo(() => {
    const urlTC = searchParams.get('timeControl')
    const urlColor = searchParams.get('color')
    if (urlTC) {
        return { timeControl: urlTC, color: (urlColor as 'white' | 'black' | 'random') || 'random' }
    }
    return null
  }, [gameId, searchParams])

  const timeControl = storedOptions?.timeControl
  const color = storedOptions?.color

  const {
    game,
    gameState,
    playerColor,
    isConnected,
  } = useGameStore()

  const showGameOver = game?.status === 'completed'

  const peerOptions = useMemo(
    () => (timeControl && color) ? { timeControl, color } : undefined,
    [timeControl, color]
  )

  const {
    makeMove,
    joinGame,
    resign,
    offerDraw,
    acceptDraw,
    handleTimeout,
    sendChat
  } = usePeerGame(gameId, peerOptions)

  const handleCopyInviteLink = useCallback(async () => {
    const url = window.location.href
    await copyToClipboard(url)
    toast.success('Invite link copied! Send it to your friend.')
  }, [])

  const handleJoinAsWhite = useCallback(async () => {
    const result = await joinGame('white')
    if (!result.success) {
      toast.error(result.error || 'Failed to join as White')
    }
  }, [joinGame])

  const handleJoinAsBlack = useCallback(async () => {
    const result = await joinGame('black')
    if (!result.success) {
      toast.error(result.error || 'Failed to join as Black')
    }
  }, [joinGame])

  const handleMove = useCallback(async (from: string, to: string, promotion?: string) => {
    const result = await makeMove(from, to, promotion)
    if (!result.success) {
      toast.error(result.error || 'Invalid move')
    }
    return { success: result.success }
  }, [makeMove])

  const handleWhiteTimeout = useCallback(() => {
    if (playerColor === 'white') {
      handleTimeout('white')
    }
  }, [playerColor, handleTimeout])

  const handleBlackTimeout = useCallback(() => {
    if (playerColor === 'black') {
      handleTimeout('black')
    }
  }, [playerColor, handleTimeout])

  if (!game || !gameState) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="animate-pulse">Loading game...</div>
          </CardContent>
        </Card>
      </main>
    )
  }

  const isWaitingForOpponent = game.status === 'waiting'
  const isSpectator = playerColor === null && game.status !== 'waiting'
  const viewColor = playerColor ?? 'white'

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Chess Game</h1>
            <Badge variant={isConnected ? 'default' : 'destructive'}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
            {isSpectator && (
              <Badge variant="secondary">Spectating</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{game.time_control}</span>
            <Button variant="outline" size="sm" onClick={handleCopyInviteLink}>
              Copy Invite Link
            </Button>
          </div>
        </div>

        {isWaitingForOpponent && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex flex-col items-center gap-4">
                <p className="text-lg">Waiting for opponent...</p>
                <p className="text-sm text-muted-foreground">
                  Share the invite link with a friend to start playing
                </p>
                
                {!playerColor && (
                  <div className="flex gap-2">
                    {!game.white_player_id && (
                      <Button onClick={handleJoinAsWhite}>
                        Join as White
                      </Button>
                    )}
                    {!game.black_player_id && (
                      <Button onClick={handleJoinAsBlack}>
                        Join as Black
                      </Button>
                    )}
                  </div>
                )}
                
                <Button variant="outline" onClick={handleCopyInviteLink}>
                  Copy Invite Link
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-slate-800 border border-slate-600" />
                <span className="font-medium">
                  {viewColor === 'white' ? 'Black' : 'White'}
                </span>
              </div>
              <ChessClock 
                color={viewColor === 'white' ? 'black' : 'white'} 
                onTimeout={viewColor === 'white' ? handleBlackTimeout : handleWhiteTimeout}
              />
            </div>

            <ChessBoard 
              onMove={handleMove}
              disabled={game.status !== 'active'}
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-white border border-slate-300" />
                <span className="font-medium">
                  {viewColor === 'white' ? 'White' : 'Black'}
                  {playerColor && ' (You)'}
                </span>
              </div>
              <ChessClock 
                color={viewColor}
                onTimeout={viewColor === 'white' ? handleWhiteTimeout : handleBlackTimeout}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Game Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {game.status === 'waiting' && (
                    <p className="text-yellow-500">Waiting for opponent</p>
                  )}
                  {game.status === 'active' && (
                    <p className="text-green-500">
                      {gameState.turn === 'w' ? "White's" : "Black's"} turn
                      {gameState.is_check && ' - Check!'}
                    </p>
                  )}
                  {game.status === 'completed' && (
                    <p className="text-blue-500">
                      Game Over - {game.result === 'draw' ? 'Draw' : `${game.result} wins`}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="flex-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Moves</CardTitle>
              </CardHeader>
              <CardContent className="h-[200px] lg:h-[300px]">
                <MoveHistory />
              </CardContent>
            </Card>

            <ChatBox onSendMessage={sendChat} />

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Controls</CardTitle>
              </CardHeader>
              <CardContent>
                <GameControls
                  onResign={resign}
                  onOfferDraw={offerDraw}
                  onAcceptDraw={acceptDraw}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <GameOverDialog 
          open={showGameOver} 
          onRematch={() => {
            router.push('/')
          }}
        />
      </div>
    </main>
  )
}
