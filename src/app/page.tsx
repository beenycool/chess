'use client'

import { Game } from "@/types/database"
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { nanoid } from 'nanoid'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import { createBrowserSupabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Play, Plus, Users, Globe } from 'lucide-react'
import { TIME_CONTROLS } from '@/lib/constants'

// Define a concrete type for games with player info
type GameWithPlayers = Game & {
  white: { username: string; elo: number } | null
  black: { username: string; elo: number } | null
}

export default function Home() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile } = useAuth()
  const [timeControl, setTimeControl] = useState('10+0')
  const [color, setColor] = useState('random')
  const [activeGames, setActiveGames] = useState<GameWithPlayers[]>([])
  const [loading, setLoading] = useState(true)
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const supabase = createBrowserSupabase()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Initialize options from URL if present
  useEffect(() => {
    const tc = searchParams.get('timeControl')
    const c = searchParams.get('color')
    if (tc && TIME_CONTROLS.some(t => t.name === tc)) setTimeControl(tc)
    if (c && ['white', 'black', 'random'].includes(c)) setColor(c)
  }, [searchParams])

  const fetchActiveGames = useCallback(async () => {
    setLobbyError(null)
    const { data, error } = await supabase
      .from('games')
      .select(`
        *,
        white:white_id(username, elo),
        black:black_id(username, elo)
      `)
      .eq('status', 'waiting')
      .limit(10)

    if (error) {
        console.error('Error fetching active games:', error)
        setLobbyError('Failed to load active games')
    } else if (data) {
        // Cast to our defined type
        setActiveGames(data as unknown as GameWithPlayers[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    fetchActiveGames()
    // Set up real-time subscription for active games, filtered by status=waiting
    const channel = supabase
      .channel('public:games')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: 'status=eq.waiting'
      }, () => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
    fetchActiveGames()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchActiveGames, supabase])

  const handleCreateGame = () => {
    const gameId = nanoid(10)
    // Encode options in URL
    const params = new URLSearchParams()
    params.set('timeControl', timeControl)
    params.set('color', color)

    // Also save to session storage as fallback
    if (typeof window !== 'undefined') {
        sessionStorage.setItem(`game-options:${gameId}`, JSON.stringify({
            timeControl,
            color
        }))
    }

    router.push(`/game/${gameId}?${params.toString()}`)
  }

  const handleJoinGame = (gameId: string) => {
    router.push(`/game/${gameId}`)
  }

  const initial = profile?.username?.[0] ? profile.username[0].toUpperCase() : 'U'

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8">
      {/* Hero / Welcome */}
      <div className="text-center py-8 space-y-4">
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight">
          Play Chess with Friends
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Create a room, invite a friend, and play instantly in your browser.
          No complex setup, just pure chess.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Game Section */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              Create New Game
            </CardTitle>
            <CardDescription>Configure your match and invite an opponent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="time-control-select" className="text-sm font-medium">Time Control</label>
                <Select value={timeControl} onValueChange={setTimeControl}>
                  <SelectTrigger id="time-control-select">
                    <SelectValue placeholder="Select time control" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_CONTROLS.map((tc) => (
                      <SelectItem key={tc.name} value={tc.name}>
                        {tc.name} ({tc.label})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="color-select" className="text-sm font-medium">Your Color</label>
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger id="color-select">
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random">Random</SelectItem>
                    <SelectItem value="white">White</SelectItem>
                    <SelectItem value="black">Black</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              className="w-full py-6 text-lg"
              onClick={handleCreateGame}
            >
              <Play className="w-5 h-5 mr-2 fill-current" />
              Create Game Room
            </Button>

            {!user && (
              <p className="text-xs text-center text-yellow-500 bg-yellow-500/10 p-2 rounded">
                Note: Game history and Elo updates require login.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Live Lobby Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Live Lobby
            </CardTitle>
            <CardDescription>Join a waiting game or spectate</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : lobbyError ? (
                <div className="text-center py-12 space-y-2">
                    <p className="text-red-500">{lobbyError}</p>
                    <Button variant="link" onClick={() => // eslint-disable-next-line react-hooks/exhaustive-deps
    fetchActiveGames()}>Retry</Button>
                </div>
            ) : activeGames.length === 0 ? (
              <div className="text-center py-12 space-y-4 border-2 border-dashed rounded-xl">
                <Users className="w-12 h-12 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">No active games waiting. Be the first to create one!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeGames.map((game) => (
                  <div
                    key={game.id}
                    className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">
                          {game.white?.username || game.black?.username || 'Guest'}&apos;s Game
                        </span>
                        <Badge variant="secondary" className="text-[10px] px-1 h-4">
                          {game.time_control}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Hosted by {game.white?.username || game.black?.username || 'Anonymous'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="group-hover:bg-primary group-hover:text-primary-foreground transition-all"
                      onClick={() => handleJoinGame(game.id)}
                    >
                      Join Match
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats Footer for Logged In User */}
      {user && profile && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
                {initial}
              </div>
              <div>
                <h3 className="font-bold text-lg">{profile.username}</h3>
                <p className="text-sm text-muted-foreground">Elo: {profile.elo}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-center px-4 border-r">
                <p className="text-xs text-muted-foreground uppercase">Wins</p>
                <p className="font-bold text-green-500">{profile.wins}</p>
              </div>
              <div className="text-center px-4 border-r">
                <p className="text-xs text-muted-foreground uppercase">Losses</p>
                <p className="font-bold text-red-500">{profile.losses}</p>
              </div>
              <div className="text-center px-4">
                <p className="text-xs text-muted-foreground uppercase">Win Rate</p>
                <p className="font-bold">
                  {profile.wins + profile.losses + profile.draws > 0
                    ? Math.round((profile.wins / (profile.wins + profile.losses + profile.draws)) * 100)
                    : 0}%
                </p>
              </div>
            </div>
            <Button variant="link" asChild>
              <Link href="/profile">View Full History →</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
