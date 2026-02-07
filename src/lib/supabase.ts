import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
if (!supabaseAnonKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')

export const createBrowserSupabase = () =>
  createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)

export const createServerSupabase = (context: {
  cookies: {
    getAll: () => { name: string; value: string }[]
    setAll: (cookies: { name: string; value: string; options: Record<string, any> }[]) => void
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
