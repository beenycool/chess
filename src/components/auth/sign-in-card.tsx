'use client'

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createBrowserSupabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface SignInCardProps {
  onSignedIn?: () => void
  title?: string
  description?: string
}

export function SignInCard({ onSignedIn, title = 'Sign In', description }: SignInCardProps) {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const usernameId = useId()
  const supabase = createBrowserSupabase()

  const handleAuth = async () => {
    if (!username.trim()) {
      toast.error('Please enter a username')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            username: username.trim(),
          }
        }
      })
      if (error) throw error
      toast.success('Welcome!')
      setUsername('')
      onSignedIn?.()
    } catch (error: unknown) {
      let message = 'Authentication failed'
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        message = (error as any).message
      }
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl font-bold">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={usernameId}>
            Username
          </label>
          <Input
            id={usernameId}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="e.g. queenfan"
            required
          />
        </div>
        <Button className="w-full" size="lg" onClick={handleAuth} disabled={loading}>
          {loading ? 'Loading...' : 'Play'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          No email required. Just pick a username and play!
        </p>
      </CardContent>
    </Card>
  )
}
