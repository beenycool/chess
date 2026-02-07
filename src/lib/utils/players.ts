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

type StoredPlayer = PlayerProfile & {
  password: string
  salt?: string
}

const PLAYERS_KEY = 'chess_players'
const CURRENT_PLAYER_KEY = 'chess_current_player'
const PLAYER_EVENT = 'chess-player-update'
const EMPTY_PLAYERS: StoredPlayer[] = []
const EMPTY_PUBLIC_PROFILES: PlayerProfile[] = []

let cachedPlayersRaw: string | null = null
let cachedPlayers: StoredPlayer[] = EMPTY_PLAYERS
let cachedPublicPlayers: PlayerProfile[] = EMPTY_PUBLIC_PROFILES

const defaultStats = (): PlayerStats => ({
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
})

const isBrowser = () => typeof window !== 'undefined'

const normalizeUsername = (username: string) => username.trim().toLowerCase()
const sanitizeUsername = (username: string) => username.replace(/[^a-z0-9_-]/g, '')
const getUsernameKey = (username: string) => sanitizeUsername(normalizeUsername(username))
const USERNAME_PATTERN = /^[a-z0-9_-]+$/

const notifyPlayers = () => {
  if (!isBrowser()) return
  window.dispatchEvent(new Event(PLAYER_EVENT))
}

const normalizeStoredPlayer = (player: StoredPlayer): StoredPlayer => ({
  ...player,
  username: getUsernameKey(player.username ?? ''),
  password: player.password ?? '',
  salt: player.salt ?? '',
  stats: {
    games: player.stats?.games ?? 0,
    wins: player.stats?.wins ?? 0,
    losses: player.stats?.losses ?? 0,
    draws: player.stats?.draws ?? 0,
  },
})

const toPublicProfile = (player: StoredPlayer): PlayerProfile => ({
  username: player.username,
  stats: player.stats,
})

const PASSWORD_ITERATIONS = 1_000_000

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const hexToBytes = (hex: string) => {
  const matches = hex.match(/.{1,2}/g)
  if (!matches) return new Uint8Array()
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)))
}

const isHexHash = (value: string) => /^[a-f0-9]{64}$/i.test(value)

const hashLegacyPassword = async (value: string) => {
  if (!isBrowser() || !globalThis.crypto?.subtle) return null
  const data = new TextEncoder().encode(value)
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(hashBuffer))
}

// PBKDF2 hash using a hex-encoded salt, returning a hex digest or null if unavailable.
const hashPassword = async (value: string, salt: string) => {
  if (!isBrowser() || !globalThis.crypto?.subtle) return null
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(value),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBytes(salt),
      iterations: PASSWORD_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256
  )
  return bytesToHex(new Uint8Array(derivedBits))
}

const generateSalt = () => {
  if (!isBrowser() || !globalThis.crypto?.getRandomValues) return null
  const salt = new Uint8Array(16)
  globalThis.crypto.getRandomValues(salt)
  return bytesToHex(salt)
}

const getStoredPlayerData = (): StoredPlayer[] => {
  if (!isBrowser()) return EMPTY_PLAYERS
  const raw = localStorage.getItem(PLAYERS_KEY) ?? '[]'
  if (raw === cachedPlayersRaw) return cachedPlayers
  cachedPlayersRaw = raw
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      cachedPlayers = EMPTY_PLAYERS
      cachedPublicPlayers = EMPTY_PUBLIC_PROFILES
      return cachedPlayers
    }
    cachedPlayers = parsed.map((player) => normalizeStoredPlayer(player as StoredPlayer))
    cachedPublicPlayers = cachedPlayers.map(toPublicProfile)
    return cachedPlayers
  } catch {
    cachedPlayers = EMPTY_PLAYERS
    cachedPublicPlayers = EMPTY_PUBLIC_PROFILES
    return cachedPlayers
  }
}

export const getStoredPlayers = (): PlayerProfile[] => {
  if (!isBrowser()) return EMPTY_PUBLIC_PROFILES
  getStoredPlayerData()
  return cachedPublicPlayers
}

const savePlayers = (players: StoredPlayer[]) => {
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
  getStoredPlayerData()
  const usernameKey = getUsernameKey(username)
  return cachedPublicPlayers.find((player) => getUsernameKey(player.username) === usernameKey) ?? null
}

export const signInPlayer = async (
  username: string,
  password: string
): Promise<{ success: boolean; error?: string; player?: PlayerProfile }> => {
  const normalizedUsername = normalizeUsername(username)
  if (!normalizedUsername) return { success: false, error: 'Username is required.' }
  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    return { success: false, error: 'Use only letters, numbers, dashes, and underscores.' }
  }
  const usernameKey = normalizedUsername
  if (!password) return { success: false, error: 'Password is required.' }

  const players = getStoredPlayerData()
  const existingIndex = players.findIndex(
    (player) => getUsernameKey(player.username) === usernameKey
  )

  if (existingIndex >= 0) {
    const existing = normalizeStoredPlayer(players[existingIndex])
    const hasSalt = Boolean(existing.salt)

    if (hasSalt) {
      const saltedHash = await hashPassword(password, existing.salt ?? '')
      if (!saltedHash || saltedHash !== existing.password) {
        return { success: false, error: 'Incorrect password.' }
      }
      const updatedPlayer: StoredPlayer = {
        ...existing,
        username: usernameKey,
      }
      const updatedPlayers = [...players]
      updatedPlayers[existingIndex] = updatedPlayer
      savePlayers(updatedPlayers)
      localStorage.setItem(CURRENT_PLAYER_KEY, usernameKey)
      notifyPlayers()
      return { success: true, player: toPublicProfile(updatedPlayer) }
    }

    const legacyHash = await hashLegacyPassword(password)
    if (!legacyHash) return { success: false, error: 'Unable to secure password.' }

    const storedLegacyHash = isHexHash(existing.password)
      ? existing.password
      : await hashLegacyPassword(existing.password)
    if (!storedLegacyHash || storedLegacyHash !== legacyHash) {
      return { success: false, error: 'Incorrect password.' }
    }

    const newSalt = generateSalt()
    if (!newSalt) return { success: false, error: 'Unable to secure password.' }
    const saltedHash = await hashPassword(password, newSalt)
    if (!saltedHash) return { success: false, error: 'Unable to secure password.' }

    const updatedPlayer: StoredPlayer = {
      ...existing,
      username: usernameKey,
      password: saltedHash,
      salt: newSalt,
    }
    const updatedPlayers = [...players]
    updatedPlayers[existingIndex] = updatedPlayer
    savePlayers(updatedPlayers)
    localStorage.setItem(CURRENT_PLAYER_KEY, usernameKey)
    notifyPlayers()
    return { success: true, player: toPublicProfile(updatedPlayer) }
  }

  const newSalt = generateSalt()
  if (!newSalt) return { success: false, error: 'Unable to secure password.' }
  const saltedHash = await hashPassword(password, newSalt)
  if (!saltedHash) return { success: false, error: 'Unable to secure password.' }

  const newPlayer: StoredPlayer = {
    username: usernameKey,
    password: saltedHash,
    salt: newSalt,
    stats: defaultStats(),
  }

  const updatedPlayers = [...players, newPlayer]
  savePlayers(updatedPlayers)
  localStorage.setItem(CURRENT_PLAYER_KEY, newPlayer.username)
  notifyPlayers()
  return { success: true, player: toPublicProfile(newPlayer) }
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
  const usernameKey = getUsernameKey(username)
  const players = getStoredPlayerData()
  const index = players.findIndex(
    (player) => getUsernameKey(player.username) === usernameKey
  )
  if (index < 0) return null

  const updatedPlayer = normalizeStoredPlayer(players[index])
  updatedPlayer.stats.games += 1

  if (result === 'win') {
    updatedPlayer.stats.wins += 1
  } else if (result === 'loss') {
    updatedPlayer.stats.losses += 1
  } else if (result === 'draw') {
    updatedPlayer.stats.draws += 1
  }

  const updatedPlayers = [...players]
  updatedPlayers[index] = updatedPlayer
  savePlayers(updatedPlayers)
  notifyPlayers()
  return toPublicProfile(updatedPlayer)
}
