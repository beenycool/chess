'use client'

import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase'
import { toast } from 'sonner'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Verifying your login...')

  useEffect(() => {
    const handleAuthCallback = async () => {
      const supabase = createBrowserSupabase()
      
      try {
        // Exchange the code for a session
        const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(
          searchParams.get('code') || ''
        )

        if (error) throw error

        if (session) {
          setStatus('success')
          setMessage('Login successful! Redirecting...')
          toast.success('Welcome back!')
          
          // Redirect to home or the page they were trying to access
          const next = searchParams.get('next') || '/'
          router.push(next)
        } else {
          throw new Error('No session found')
        }
      } catch (error) {
        console.error('Auth callback error:', error)
        setStatus('error')
        setMessage('Failed to verify login. The link may have expired.')
        toast.error('Login failed. Please try again.')
        
        // Redirect back to home after a delay
        setTimeout(() => {
          router.push('/')
        }, 3000)
      }
    }

    handleAuthCallback()
  }, [searchParams, router])

  return (
    <div className="text-center space-y-4">
      {status === 'loading' && (
        <>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">{message}</p>
        </>
      )}
      
      {status === 'success' && (
        <>
          <div className="text-green-500 text-5xl">✓</div>
          <p className="text-muted-foreground">{message}</p>
        </>
      )}
      
      {status === 'error' && (
        <>
          <div className="text-red-500 text-5xl">✕</div>
          <p className="text-muted-foreground">{message}</p>
          <p className="text-sm text-muted-foreground">Redirecting you back...</p>
        </>
      )}
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Suspense fallback={
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }>
        <AuthCallbackContent />
      </Suspense>
    </div>
  )
}
