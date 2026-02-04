import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'
import { TIME_CONTROLS, DEFAULT_TIME_CONTROL } from '@/lib/constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { timeControl = DEFAULT_TIME_CONTROL.name, playerId, color = 'random' } = body

    // Find time control settings
    const tc = TIME_CONTROLS.find(t => t.name === timeControl) || DEFAULT_TIME_CONTROL

    const gameId = nanoid(10)
    
    // Determine color assignment
    let whitePlayerId = null
    let blackPlayerId = null
    
    if (color === 'white') {
      whitePlayerId = playerId
    } else if (color === 'black') {
      blackPlayerId = playerId
    } else {
      // Random
      if (Math.random() < 0.5) {
        whitePlayerId = playerId
      } else {
        blackPlayerId = playerId
      }
    }

    // Create game
    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert({
        id: gameId,
        time_control: tc.name,
        initial_time_ms: tc.initialTimeMs,
        increment_ms: tc.incrementMs,
        white_player_id: whitePlayerId,
        black_player_id: blackPlayerId,
        status: 'waiting',
      })
      .select()
      .single()

    if (gameError) throw gameError

    // Create initial game state
    const { error: stateError } = await supabase
      .from('game_states')
      .insert({
        game_id: gameId,
        white_time_ms: tc.initialTimeMs,
        black_time_ms: tc.initialTimeMs,
      })

    if (stateError) throw stateError

    return NextResponse.json({
      success: true,
      gameId,
      game,
      playerColor: whitePlayerId === playerId ? 'white' : 'black',
    })
  } catch (error) {
    console.error('Error creating game:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create game' },
      { status: 500 }
    )
  }
}
