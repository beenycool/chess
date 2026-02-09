import { createBrowserClient, createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const createNoopSupabase = (): SupabaseClient<Database> => {
  const noopResponse = { data: null, error: null }
  const noopPromise = Promise.resolve(noopResponse)

  const noopQuery = (() => {
    const query = {
      select: (..._args: unknown[]) => query,
      insert: (..._args: unknown[]) => query,
      update: (..._args: unknown[]) => query,
      delete: (..._args: unknown[]) => query,
      upsert: (..._args: unknown[]) => query,
      eq: (..._args: unknown[]) => query,
      in: (..._args: unknown[]) => query,
      limit: (..._args: unknown[]) => query,
      order: (..._args: unknown[]) => query,
      single: () => noopPromise,
      then: (
        onFulfilled?: (value: typeof noopResponse) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => noopPromise.then(onFulfilled, onRejected),
      catch: (onRejected?: (reason: unknown) => unknown) => noopPromise.catch(onRejected),
      finally: (onFinally?: () => void) => noopPromise.finally(onFinally),
    }

    return query
  })()

  const noopClient = {
    auth: {
      onAuthStateChange: (..._args: unknown[]) => ({
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
      }),
      signOut: async () => ({ error: null }),
      signInAnonymously: async (..._args: unknown[]) => ({ data: { user: null, session: null }, error: null }),
    },
    from: (..._args: unknown[]) => noopQuery,
    rpc: async (..._args: unknown[]) => ({ data: null, error: null }),
  } as unknown as SupabaseClient<Database>

  return noopClient
}

export const createBrowserSupabase = () => {
  if (typeof window === 'undefined') {
    return createNoopSupabase()
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
}

export const createServerSupabase = (context: {
  cookies: {
    getAll: () => { name: string; value: string }[]
    setAll: (cookies: { name: string; value: string; options: Record<string, any> }[]) => void
  }
}) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return context.cookies.getAll()
      },
      setAll(cookiesToSet) {
        context.cookies.setAll(cookiesToSet)
      },
    },
  })
}
