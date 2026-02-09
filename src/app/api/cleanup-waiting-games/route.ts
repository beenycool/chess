import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'
import { WAITING_ROOM_TIMEOUT_MS } from '@/lib/constants'

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const cleanupSecret = process.env.CLEANUP_SECRET

    if (!supabaseUrl || !supabaseServiceRoleKey || !cleanupSecret) {
      return NextResponse.json(
        { error: 'Missing Supabase env vars' },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cleanupSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey)
    const cutoff = new Date(Date.now() - WAITING_ROOM_TIMEOUT_MS).toISOString()

    const { error } = await supabase
      .from('games')
      .update({ status: 'expired' })
      .eq('status', 'waiting')
      .lt('created_at', cutoff)

    if (error) {
      console.error('Cleanup waiting games error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('Cleanup waiting games error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cleanup failed' },
      { status: 500 }
    )
  }
}
