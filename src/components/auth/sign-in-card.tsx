'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { signInPlayer } from '@/lib/utils/players'
import type { PlayerProfile } from '@/lib/utils/players'

interface SignInCardProps {
  onSignedIn: (player: PlayerProfile) => void
  title?: string
  description?: string
}

export function SignInCard({ onSignedIn, title = 'Sign In', description }: SignInCardProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = () => {
    const result = signInPlayer(username, password)
    if (!result.success || !result.player) {
      setError(result.error || 'Unable to sign in.')
      return
    }
    setError(null)
    setUsername('')
    setPassword('')
    onSignedIn(result.player)
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl font-bold">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Username</label>
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="e.g. queenfan"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Password</label>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Shared secret"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" size="lg" onClick={handleSignIn}>
          Sign In / Create Player
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          No email or security—just between friends.
        </p>
      </CardContent>
    </Card>
  )
}
