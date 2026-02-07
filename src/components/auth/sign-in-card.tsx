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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const emailId = useId()
  const passwordId = useId()
  const usernameId = useId()
  const supabase = createBrowserSupabase()

  const handleAuth = async () => {
    setLoading(true)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username,
            }
          }
        })
        if (error) throw error
        toast.success('Check your email for the confirmation link!')
        setEmail('')
        setPassword('')
        setUsername('')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        toast.success('Logged in successfully!')
        setEmail('')
        setPassword('')
        onSignedIn?.()
      }
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
        <CardTitle className="text-3xl font-bold">{isSignUp ? 'Sign Up' : title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {isSignUp && (
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
        )}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={emailId}>
            Email
          </label>
          <Input
            id={emailId}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={passwordId}>
            Password
          </label>
          <Input
            id={passwordId}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
          />
        </div>
        <Button className="w-full" size="lg" onClick={handleAuth} disabled={loading}>
          {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
        </Button>
        <div className="text-center">
          <button
            type="button"
            className="text-sm text-primary hover:underline"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
