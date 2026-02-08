import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'
import { WAITING_ROOM_TIMEOUT_MS } from '@/lib/constants'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars')
}

export async function GET() {
  try {
    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
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
