'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy } from 'lucide-react'

export default function LeaderboardPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLeaderboard() {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('elo', { ascending: false })
        .limit(50)

      if (!error && data) {
        setProfiles(data)
      }
      setLoading(false)
    }

    fetchLeaderboard()
  }, [])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <p className="animate-pulse">Loading leaderboard...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="text-yellow-500" />
            Global Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-muted">
                  <th className="pb-4 pt-2 font-medium">Rank</th>
                  <th className="pb-4 pt-2 font-medium">Player</th>
                  <th className="pb-4 pt-2 font-medium">Elo</th>
                  <th className="pb-4 pt-2 font-medium text-center">W / L / D</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile, index) => (
                  <tr key={profile.id} className="border-b border-muted/50 hover:bg-muted/30 transition-colors">
                    <td className="py-4 font-bold">
                      {index + 1 === 1 && '🥇'}
                      {index + 1 === 2 && '🥈'}
                      {index + 1 === 3 && '🥉'}
                      {index + 1 > 3 && index + 1}
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-xs uppercase">
                          {profile.username[0]}
                        </div>
                        <span className="font-medium">{profile.username}</span>
                      </div>
                    </td>
                    <td className="py-4">
                      <Badge variant="secondary" className="font-mono">
                        {profile.elo}
                      </Badge>
                    </td>
                    <td className="py-4 text-center text-sm text-muted-foreground">
                      <span className="text-green-500">{profile.wins}</span> /
                      <span className="text-red-500 px-1">{profile.losses}</span> /
                      <span>{profile.draws}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
