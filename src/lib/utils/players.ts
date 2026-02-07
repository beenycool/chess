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

const normalizeUsername = (username: string) => username.trim().toLowerCase()

const notifyPlayers = () => {
  if (!isBrowser()) return
  window.dispatchEvent(new Event(PLAYER_EVENT))
}

const normalizePlayer = (player: PlayerProfile): PlayerProfile => ({
  ...player,
  username: normalizeUsername(player.username ?? ''),
  password: player.password ?? '',
  stats: {
    games: player.stats?.games ?? 0,
    wins: player.stats?.wins ?? 0,
    losses: player.stats?.losses ?? 0,
    draws: player.stats?.draws ?? 0,
  },
})

const isHashedPassword = (value: string) => /^[a-f0-9]{64}$/i.test(value)

const hashPassword = async (value: string) => {
  if (!isBrowser() || !globalThis.crypto?.subtle) return null
  const data = new TextEncoder().encode(value)
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

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
  const normalizedUsername = normalizeUsername(username)
  if (normalizedUsername === cachedCurrentUsername && cachedCurrentPlayer && players.includes(cachedCurrentPlayer)) {
    return cachedCurrentPlayer
  }
  cachedCurrentUsername = normalizedUsername
  cachedCurrentPlayer = players.find((player) => normalizeUsername(player.username) === normalizedUsername) ?? null
  return cachedCurrentPlayer
}

export const signInPlayer = async (
  username: string,
  password: string
): Promise<{ success: boolean; error?: string; player?: PlayerProfile }> => {
  const normalizedUsername = normalizeUsername(username)
  if (!normalizedUsername) return { success: false, error: 'Username is required.' }
  if (!password) return { success: false, error: 'Password is required.' }

  const hashedPassword = await hashPassword(password)
  if (!hashedPassword) return { success: false, error: 'Unable to secure password.' }

  const players = getStoredPlayers()
  const existingIndex = players.findIndex(
    (player) => normalizeUsername(player.username) === normalizedUsername
  )

  if (existingIndex >= 0) {
    const existing = normalizePlayer(players[existingIndex])
    const matchesHashed = existing.password === hashedPassword
    const matchesLegacy = !isHashedPassword(existing.password) && existing.password === password

    if (!matchesHashed && !matchesLegacy) {
      return { success: false, error: 'Incorrect password.' }
    }
    const updatedPlayer: PlayerProfile = {
      ...existing,
      username: normalizedUsername,
      password: hashedPassword,
    }
    const updatedPlayers = [...players]
    updatedPlayers[existingIndex] = updatedPlayer
    savePlayers(updatedPlayers)
    localStorage.setItem(CURRENT_PLAYER_KEY, normalizedUsername)
    notifyPlayers()
    return { success: true, player: updatedPlayer }
  }

  const newPlayer: PlayerProfile = {
    username: normalizedUsername,
    password: hashedPassword,
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
  const normalizedUsername = normalizeUsername(username)
  const players = getStoredPlayers()
  const index = players.findIndex(
    (player) => normalizeUsername(player.username) === normalizedUsername
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
