export type PlayerStats = {
  games: number
  wins: number
  losses: number
  draws: number
}

export type PlayerProfile = {
  username: string
  stats: PlayerStats
}

export const getWinRate = (stats: PlayerStats) => (stats.games ? stats.wins / stats.games : 0)
