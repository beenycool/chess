import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { Database } from '@/types/database'

// Use placeholders during build if environment variables are missing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const createBrowserSupabase = () =>
  createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)

export const createServerSupabase = (context: {
  cookies: {
    getAll: () => { name: string; value: string }[]
    setAll: (cookies: { name: string; value: string; options: Record<string, unknown> }[]) => void
  }
}) =>
  createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return context.cookies.getAll()
      },
      setAll(cookiesToSet) {
        context.cookies.setAll(cookiesToSet)
      },
    },
  })
