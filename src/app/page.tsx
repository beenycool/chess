'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInCard } from '@/components/auth/sign-in-card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TIME_CONTROLS, DEFAULT_TIME_CONTROL } from '@/lib/constants'
import { getOrCreatePlayerId, generateGameId } from '@/lib/utils/helpers'
import {
  getCurrentPlayer,
  getStoredPlayers,
  signOutPlayer,
  subscribePlayers,
  type PlayerProfile,
} from '@/lib/utils/players'

const emptyPlayersSnapshot: PlayerProfile[] = []
const emptyPlayerSnapshot: PlayerProfile | null = null

const getWinRate = (player: PlayerProfile) => (player.stats.games ? player.stats.wins / player.stats.games : 0)

const sortPlayersByRanking = (a: PlayerProfile, b: PlayerProfile) => {
  const winRateDiff = getWinRate(b) - getWinRate(a)
  if (winRateDiff !== 0) return winRateDiff
  const winDiff = b.stats.wins - a.stats.wins
  if (winDiff !== 0) return winDiff
  const gamesDiff = b.stats.games - a.stats.games
  if (gamesDiff !== 0) return gamesDiff
  return a.username.localeCompare(b.username)
}

export default function HomePage() {
  const router = useRouter()
  const [timeControl, setTimeControl] = useState(DEFAULT_TIME_CONTROL.name)
  const [colorPreference, setColorPreference] = useState<'random' | 'white' | 'black'>('random')
  const [playerId, setPlayerId] = useState<string | null>(null)
  const players = useSyncExternalStore(subscribePlayers, getStoredPlayers, () => emptyPlayersSnapshot)
  const currentPlayer = useSyncExternalStore(subscribePlayers, getCurrentPlayer, () => emptyPlayerSnapshot)

  useEffect(() => {
    setPlayerId(getOrCreatePlayerId())
  }, [])

  const handleCreateGame = () => {
    if (!playerId) return
    
    const gameId = generateGameId()
    const params = new URLSearchParams()
    params.set('timeControl', timeControl)

    sessionStorage.setItem(
      `game-options:${gameId}`,
      JSON.stringify({ timeControl, color: colorPreference })
    )

    router.push(`/game/${gameId}?${params.toString()}`)
  }

  const leaderboard = useMemo(
    () =>
      [...players]
        .sort(sortPlayersByRanking)
        .slice(0, 5),
    [players]
  )

  const handleSignOut = () => {
    signOutPlayer()
  }

  const currentStats = currentPlayer?.stats
  const winRate = currentPlayer ? Math.round(getWinRate(currentPlayer) * 100) : 0

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {currentPlayer ? (
          <Card className="w-full">
            <CardHeader className="text-center space-y-2">
              <CardTitle className="text-3xl font-bold">Chess</CardTitle>
              <CardDescription>
                Signed in as <span className="font-medium text-foreground">{currentPlayer.username}</span>. Create a
                game and share the invite link.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Time Control</label>
                <Select value={timeControl} onValueChange={setTimeControl}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_CONTROLS.map((tc) => (
                      <SelectItem key={tc.name} value={tc.name}>
                        {tc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Play as</label>
                <Select value={colorPreference} onValueChange={(v) => setColorPreference(v as typeof colorPreference)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random">Random</SelectItem>
                    <SelectItem value="white">White</SelectItem>
                    <SelectItem value="black">Black</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" size="lg" onClick={handleCreateGame} disabled={!playerId}>
                Create Game
              </Button>

              <div className="flex flex-col items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  Sign Out
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Hosted on Vercel. Stats stay in this browser for your friends’ leaderboard.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex justify-center">
            <SignInCard
              title="Chess"
              description="Sign in with a username and password to play with friends."
            />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Leaderboard</CardTitle>
              <CardDescription>Top players on this device.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {leaderboard.length ? (
                leaderboard.map((player, index) => (
                  <div key={player.username} className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {index + 1}. {player.username}
                    </span>
                    <span className="text-muted-foreground">
                      {player.stats.wins}-{player.stats.losses}-{player.stats.draws}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No results yet. Play a game to get started.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Trackers</CardTitle>
              <CardDescription>Your wins, losses, and draws.</CardDescription>
            </CardHeader>
            <CardContent>
              {currentStats ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground">Games</p>
                    <p className="text-lg font-semibold">{currentStats.games}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground">Win rate</p>
                    <p className="text-lg font-semibold">{winRate}%</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground">Wins</p>
                    <p className="text-lg font-semibold">{currentStats.wins}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground">Losses</p>
                    <p className="text-lg font-semibold">{currentStats.losses}</p>
                  </div>
                  <div className="rounded-md border p-3 col-span-2">
                    <p className="text-muted-foreground">Draws</p>
                    <p className="text-lg font-semibold">{currentStats.draws}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sign in with your username to start tracking your games.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
