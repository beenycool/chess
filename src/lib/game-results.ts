import { supabase } from '@/lib/supabase'

export function calculateElo(winnerElo: number, loserElo: number, isDraw: boolean = false) {
  const K = 32
  const expectedScoreWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400))

  const actualScoreWinner = isDraw ? 0.5 : 1
  const actualScoreLoser = isDraw ? 0.5 : 0

  const newWinnerElo = Math.round(winnerElo + K * (actualScoreWinner - expectedScoreWinner))
  const newLoserElo = Math.round(loserElo + K * (actualScoreLoser - (1 - expectedScoreWinner)))

  return { newWinnerElo, newLoserElo }
}

export async function recordGameResult(params: {
  gameId: string
  whiteId: string | null
  blackId: string | null
  result: 'white' | 'black' | 'draw'
  reason: string
  pgn: string
}) {
  const { gameId, whiteId, blackId, result, reason } = params

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

  // 2. If both players are registered, update their Elo and stats
  if (whiteId && blackId) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, elo, wins, losses, draws')
      .in('id', [whiteId, blackId])

    if (profileError || !profiles || profiles.length < 2) {
      console.error('Error fetching player profiles for Elo update', profileError)
      return
    }

    const whiteProfile = profiles.find(p => p.id === whiteId)!
    const blackProfile = profiles.find(p => p.id === blackId)!

    let newWhiteElo, newBlackElo
    let whiteWin = 0, whiteLoss = 0, whiteDraw = 0
    let blackWin = 0, blackLoss = 0, blackDraw = 0

    if (result === 'white') {
      const elo = calculateElo(whiteProfile.elo, blackProfile.elo, false)
      newWhiteElo = elo.newWinnerElo
      newBlackElo = elo.newLoserElo
      whiteWin = 1; blackLoss = 1
    } else if (result === 'black') {
      const elo = calculateElo(blackProfile.elo, whiteProfile.elo, false)
      newBlackElo = elo.newWinnerElo
      newWhiteElo = elo.newLoserElo
      blackWin = 1; whiteLoss = 1
    } else {
      const elo = calculateElo(whiteProfile.elo, blackProfile.elo, true)
      newWhiteElo = elo.newWinnerElo
      newBlackElo = elo.newLoserElo
      whiteDraw = 1; blackDraw = 1
    }

    // Update profiles
    await supabase.from('profiles').update({
      elo: newWhiteElo,
      wins: whiteProfile.wins + whiteWin,
      losses: whiteProfile.losses + whiteLoss,
      draws: whiteProfile.draws + whiteDraw,
    }).eq('id', whiteId)

    await supabase.from('profiles').update({
      elo: newBlackElo,
      wins: blackProfile.wins + blackWin,
      losses: blackProfile.losses + blackLoss,
      draws: blackProfile.draws + blackDraw,
    }).eq('id', blackId)
  }
}
