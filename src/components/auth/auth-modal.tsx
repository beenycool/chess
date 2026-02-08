'use client'

import { useState, useEffect } from 'react'
import { createBrowserSupabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { toast } from 'sonner'

export function AuthModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createBrowserSupabase()

  useEffect(() => {
    if (!isOpen) {
      setUsername('')
      setLoading(false)
    }
  }, [isOpen])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
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
          <DialogTitle>Choose Your Username</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAuth} className="space-y-4 py-4">
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
            {loading ? 'Loading...' : 'Play'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No email required. Just pick a username and play!
          </p>
        </form>
      </DialogContent>
    </Dialog>
  )
}
