import { createBrowserSupabase } from '@/lib/supabase'
import { Database } from '@/types/database'

export async function recordGameResult(params: {
  gameId: string
  whiteId: string | null
  blackId: string | null
  result: 'white' | 'black' | 'draw'
  reason: string
  pgn: string
}) {
  const { gameId, whiteId, blackId, result, reason, pgn } = params
  const supabase = createBrowserSupabase()

  // 1. Update the games table
  const { error: gameError } = await supabase
    .from('games')
    .upsert({
      id: gameId,
      white_id: whiteId,
      black_id: blackId,
      result,
      result_reason: reason,
      status: 'completed',
      ended_at: new Date().toISOString(),
    })

  if (gameError) {
    console.error('Error recording game result:', gameError)
    return
  }

  // Persist PGN
  const { error: pgnError } = await supabase
    .from('game_states')
    .update({ pgn: pgn || '' })
    .eq('game_id', gameId)

  if (pgnError) {
     console.error('Error recording game PGN:', pgnError)
  }

  // 2. If both players are registered, update their Elo and stats using atomic RPC
  if (whiteId && blackId) {
    // Fetch profiles first to get current Elos
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, elo')
      .in('id', [whiteId, blackId])

    if (profileError || !profiles || profiles.length < 2) {
      console.error('Error fetching player profiles for Elo update', profileError)
      return
    }

    const whiteProfile = profiles.find(p => p.id === whiteId)!
    const blackProfile = profiles.find(p => p.id === blackId)!

    // Determine outcomes
    const whiteOutcome = result === 'white' ? 'win' : result === 'black' ? 'loss' : 'draw'
    const blackOutcome = result === 'black' ? 'win' : result === 'white' ? 'loss' : 'draw'

    // Call RPC for white
    const { error: errorWhite } = await supabase.rpc('update_player_elo_rating', {
      player_id: whiteId,
      opponent_elo: blackProfile.elo,
      outcome: whiteOutcome
    })

    if (errorWhite) {
      console.error('Error updating white player stats:', errorWhite)
    }

    // Call RPC for black
    const { error: errorBlack } = await supabase.rpc('update_player_elo_rating', {
      player_id: blackId,
      opponent_elo: whiteProfile.elo,
      outcome: blackOutcome
    })

    if (errorBlack) {
      console.error('Error updating black player stats:', errorBlack)
    }
  }
}
