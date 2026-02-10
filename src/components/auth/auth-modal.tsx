'use client'

import { useState, useEffect } from 'react'
import { createBrowserSupabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

export function AuthModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'magic' | 'guest'>('magic')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const supabase = createBrowserSupabase()

  useEffect(() => {
    if (!isOpen) {
      setEmail('')
      setUsername('')
      setLoading(false)
      setMagicLinkSent(false)
      setMode('magic')
    }
  }, [isOpen])

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Please enter your email')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      
      if (error) throw error
      
      setMagicLinkSent(true)
      toast.success('Magic link sent! Check your email.')
    } catch (error: unknown) {
      let message = 'Failed to send magic link'
      if (error instanceof Error) {
        message = error.message
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        message = String((error as any).message)
      }
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleAnonymous = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      toast.error('Please enter a username')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            username: username.trim(),
          }
        }
      })
      if (error) throw error
      
      // Check what username was actually assigned
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', data.user!.id)
        .single()
      
      const assignedUsername = profile?.username || username.trim()
      if (assignedUsername !== username.trim()) {
        toast.success(`Welcome! Username "${username.trim()}" was taken, you're now "${assignedUsername}"`)
      } else {
        toast.success(`Welcome, ${assignedUsername}!`)
      }
      setIsOpen(false)
    } catch (error: unknown) {
      let message = 'Authentication failed'
      if (error instanceof Error) {
        message = error.message
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        message = String((error as any).message)
      }
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Login</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Sign In</DialogTitle>
          <DialogDescription>
            Choose how you want to sign in
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Mode Toggle */}
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <button
              type="button"
              onClick={() => setMode('magic')}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                mode === 'magic' 
                  ? 'bg-background shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setMode('guest')}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                mode === 'guest' 
                  ? 'bg-background shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Guest
            </button>
          </div>

          {mode === 'magic' ? (
            magicLinkSent ? (
              <div className="text-center space-y-4 py-4">
                <div className="text-green-500 text-5xl">✓</div>
                <p className="text-sm text-muted-foreground">
                  Check your email for the magic link! Click it to sign in.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => setMagicLinkSent(false)}
                  className="w-full"
                >
                  Send to different email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="auth-email" className="text-sm font-medium">Email</label>
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Magic Link'}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  No password needed. We'll send you a secure login link.
                </p>
              </form>
            )
          ) : (
            <form onSubmit={handleAnonymous} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="auth-username" className="text-sm font-medium">Username</label>
                <Input
                  id="auth-username"
                  placeholder="ChessMaster"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Loading...' : 'Play as Guest'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Guest accounts can't be recovered if you log out.
              </p>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
