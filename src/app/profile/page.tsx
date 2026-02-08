'use client'

import { Game } from "@/types/database"
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { createBrowserSupabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { History, TrendingUp, User as UserIcon } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type GameWithPlayers = Game & {
  white: { username: string; elo: number } | null
  black: { username: string; elo: number } | null
}

export default function ProfilePage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [games, setGames] = useState<GameWithPlayers[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserSupabase()

  const fetchGameHistory = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('games')
      .select(`
        *,
        white:white_id(username, elo),
        black:black_id(username, elo)
      `)
      .or(`white_id.eq.${user.id},black_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!error && data) {
      setGames(data as unknown as GameWithPlayers[])
    }
    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      fetchGameHistory()
    } else if (!authLoading) {
      setLoading(false)
    }
  }, [user, authLoading, fetchGameHistory])

  if (authLoading || loading) {
    return <div className="p-8 text-center animate-pulse">Loading profile...</div>
  }

  if (!user || !profile) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-muted-foreground">Please log in to view your profile.</p>
        <Link href="/">
          <Button variant="outline">Back to Home</Button>
        </Link>
      </div>
    )
  }

  const winRate = profile.wins + profile.losses + profile.draws > 0
    ? Math.round((profile.wins / (profile.wins + profile.losses + profile.draws)) * 100)
    : 0

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8">
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row gap-8 items-start">
        <Card className="w-full md:w-1/3">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <UserIcon className="w-12 h-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">{profile.username}</CardTitle>

          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Elo Rating</span>
              </div>
              <span className="text-xl font-bold">{profile.elo}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                <p className="text-xs text-green-500 font-medium">Wins</p>
                <p className="text-lg font-bold">{profile.wins}</p>
              </div>
              <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-500 font-medium">Losses</p>
                <p className="text-lg font-bold">{profile.losses}</p>
              </div>
              <div className="p-2 rounded bg-muted">
                <p className="text-xs text-muted-foreground font-medium">Draws</p>
                <p className="text-lg font-bold">{profile.draws}</p>
              </div>
            </div>
            <div className="pt-2">
              <div className="flex justify-between text-xs mb-1">
                <span>Win Rate</span>
                <span>{winRate}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${winRate}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Game History */}
        <Card className="w-full md:w-2/3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Recent Games
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              {games.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No games played yet.</p>
              ) : (
                <div className="space-y-4">
                  {games.map((game) => {
                    const isWhite = game.white_id === user.id
                    const myResult = game.result === 'draw' ? 'draw' :
                      (isWhite && game.result === 'white') || (!isWhite && game.result === 'black') ? 'win' : 'loss'
                    const opponent = isWhite ? game.black : game.white

                    return (
                      <div key={game.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <Badge variant={myResult === 'win' ? 'default' : myResult === 'loss' ? 'destructive' : 'secondary'}>
                              {myResult.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(game.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="mt-2 font-medium">
                            vs {opponent?.username || 'Guest'} ({opponent?.elo ?? 1200})
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {game.result_reason} • Played as {isWhite ? 'White' : 'Black'}
                          </div>
                        </div>
                        <Link href={`/game/${game.id}`}>
                          <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors">
                            View
                          </Badge>
                        </Link>
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
