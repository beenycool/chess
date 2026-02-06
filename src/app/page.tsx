'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TIME_CONTROLS, DEFAULT_TIME_CONTROL } from '@/lib/constants'
import { getOrCreatePlayerId, generateGameId } from '@/lib/utils/helpers'

export default function HomePage() {
  const router = useRouter()
  const [timeControl, setTimeControl] = useState(DEFAULT_TIME_CONTROL.name)
  const [colorPreference, setColorPreference] = useState<'random' | 'white' | 'black'>('random')
  const [isCreating, setIsCreating] = useState(false)
  const [playerId, setPlayerId] = useState<string | null>(null)

  useEffect(() => {
    setPlayerId(getOrCreatePlayerId())
  }, [])

  const handleCreateGame = async () => {
    if (!playerId) return
    
    setIsCreating(true)
    try {
      // Generate ID client-side
      const gameId = generateGameId()

      // Redirect with query params
      const params = new URLSearchParams()
      params.set('timeControl', timeControl)
      params.set('color', colorPreference)

      router.push(`/game/${gameId}?${params.toString()}`)
    } catch (error) {
      console.error('Failed to create game:', error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">Chess</CardTitle>
          <CardDescription>Play with friends - no sign up required</CardDescription>
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

          <Button 
            className="w-full" 
            size="lg" 
            onClick={handleCreateGame}
            disabled={isCreating || !playerId}
          >
            {isCreating ? 'Creating...' : 'Create Game'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Create a game and share the link with a friend to play
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
