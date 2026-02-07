export type PlayerStats = {
  games: number
  wins: number
  losses: number
  draws: number
}

export type PlayerProfile = {
  username: string
  password: string
  stats: PlayerStats
}

const PLAYERS_KEY = 'chess_players'
const CURRENT_PLAYER_KEY = 'chess_current_player'
const PLAYER_EVENT = 'chess-player-update'
const EMPTY_PLAYERS: PlayerProfile[] = []

let cachedPlayersRaw: string | null = null
let cachedPlayers: PlayerProfile[] = EMPTY_PLAYERS
let cachedCurrentUsername: string | null = null
let cachedCurrentPlayer: PlayerProfile | null = null

const defaultStats = (): PlayerStats => ({
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
})

const isBrowser = () => typeof window !== 'undefined'

const notifyPlayers = () => {
  if (!isBrowser()) return
  window.dispatchEvent(new Event(PLAYER_EVENT))
}

const normalizePlayer = (player: PlayerProfile): PlayerProfile => ({
  ...player,
  stats: {
    games: player.stats?.games ?? 0,
    wins: player.stats?.wins ?? 0,
    losses: player.stats?.losses ?? 0,
    draws: player.stats?.draws ?? 0,
  },
})

export const getStoredPlayers = (): PlayerProfile[] => {
  if (!isBrowser()) return EMPTY_PLAYERS
  const raw = localStorage.getItem(PLAYERS_KEY) ?? '[]'
  if (raw === cachedPlayersRaw) return cachedPlayers
  cachedPlayersRaw = raw
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      cachedPlayers = EMPTY_PLAYERS
      return cachedPlayers
    }
    cachedPlayers = parsed.map((player) => normalizePlayer(player as PlayerProfile))
    return cachedPlayers
  } catch {
    cachedPlayers = EMPTY_PLAYERS
    return cachedPlayers
  }
}

const savePlayers = (players: PlayerProfile[]) => {
  if (!isBrowser()) return
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(players))
}

export const subscribePlayers = (callback: () => void) => {
  if (!isBrowser()) return () => {}
  const handler = () => callback()
  window.addEventListener(PLAYER_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(PLAYER_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export const getCurrentPlayer = (): PlayerProfile | null => {
  if (!isBrowser()) return null
  const username = localStorage.getItem(CURRENT_PLAYER_KEY)
  if (!username) return null
  const players = getStoredPlayers()
  if (username === cachedCurrentUsername && cachedCurrentPlayer && players.includes(cachedCurrentPlayer)) {
    return cachedCurrentPlayer
  }
  cachedCurrentUsername = username
  cachedCurrentPlayer = players.find((player) => player.username === username) ?? null
  return cachedCurrentPlayer
}

export const signInPlayer = (
  username: string,
  password: string
): { success: boolean; error?: string; player?: PlayerProfile } => {
  const trimmed = username.trim()
  if (!trimmed) return { success: false, error: 'Username is required.' }
  if (!password) return { success: false, error: 'Password is required.' }

  const players = getStoredPlayers()
  const existingIndex = players.findIndex(
    (player) => player.username.toLowerCase() === trimmed.toLowerCase()
  )

  if (existingIndex >= 0) {
    const existing = players[existingIndex]
    if (existing.password !== password) {
      return { success: false, error: 'Incorrect password.' }
    }
    localStorage.setItem(CURRENT_PLAYER_KEY, existing.username)
    notifyPlayers()
    return { success: true, player: existing }
  }

  const newPlayer: PlayerProfile = {
    username: trimmed,
    password,
    stats: defaultStats(),
  }

  const updatedPlayers = [...players, newPlayer]
  savePlayers(updatedPlayers)
  localStorage.setItem(CURRENT_PLAYER_KEY, newPlayer.username)
  notifyPlayers()
  return { success: true, player: newPlayer }
}

export const signOutPlayer = () => {
  if (!isBrowser()) return
  localStorage.removeItem(CURRENT_PLAYER_KEY)
  notifyPlayers()
}

export const updatePlayerStats = (
  username: string,
  result: 'win' | 'loss' | 'draw'
): PlayerProfile | null => {
  if (!isBrowser()) return null
  const players = getStoredPlayers()
  const index = players.findIndex(
    (player) => player.username.toLowerCase() === username.toLowerCase()
  )
  if (index < 0) return null

  const updatedPlayer = normalizePlayer(players[index])
  updatedPlayer.stats.games += 1

  if (result === 'win') updatedPlayer.stats.wins += 1
  if (result === 'loss') updatedPlayer.stats.losses += 1
  if (result === 'draw') updatedPlayer.stats.draws += 1

  const updatedPlayers = [...players]
  updatedPlayers[index] = updatedPlayer
  savePlayers(updatedPlayers)
  notifyPlayers()
  return updatedPlayer
}
