import http from 'node:http'
import { parse } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MAX_PORT = 65535
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024
const DEFAULT_CORS_ORIGIN = process.env.NODE_ENV === 'production' ? '' : '*'
const parsedPort = Number.parseInt(process.env.PORT || '4000', 10)
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= MAX_PORT ? parsedPort : 4000
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, 'data', 'players.json')
const PASSWORD_ITERATIONS = 600_000
const USERNAME_PATTERN = /^[a-z0-9_-]+$/
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN
const parsedBodyLimit = Number.parseInt(process.env.MAX_BODY_BYTES || String(DEFAULT_MAX_BODY_BYTES), 10)
const MAX_BODY_BYTES = Number.isInteger(parsedBodyLimit) && parsedBodyLimit > 0 ? parsedBodyLimit : DEFAULT_MAX_BODY_BYTES
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20
const rateLimit = new Map()

let dataLock = Promise.resolve()

const ensureDataDir = () => {
  const dir = path.dirname(DATA_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const loadData = () => {
  ensureDataDir()
  if (!fs.existsSync(DATA_PATH)) {
    return { players: {} }
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.players) {
      return { players: {} }
    }
    return parsed
  } catch {
    return { players: {} }
  }
}

const saveData = async (data) => {
  ensureDataDir()
  const tempPath = `${DATA_PATH}.tmp`
  await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2))
  await fs.promises.rename(tempPath, DATA_PATH)
}

const withDataLock = async (handler) => {
  const previous = dataLock
  let release
  dataLock = new Promise((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await handler()
  } finally {
    release()
  }
}

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

const isRateLimited = (req) => {
  const ip = getClientIp(req)
  const now = Date.now()
  const entry = rateLimit.get(ip) || { count: 0, start: now }
  if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0
    entry.start = now
  }
  entry.count += 1
  rateLimit.set(ip, entry)
  return entry.count > RATE_LIMIT_MAX
}

const normalizeUsername = (username) => username.trim().toLowerCase()

const hashPassword = (password, salt) =>
  new Promise((resolve, reject) => {
    crypto.pbkdf2(password, Buffer.from(salt, 'hex'), PASSWORD_ITERATIONS, 32, 'sha256', (err, derivedKey) => {
      if (err) return reject(err)
      return resolve(derivedKey.toString('hex'))
    })
  })

const createSalt = () => crypto.randomBytes(16).toString('hex')

const jsonResponse = (res, statusCode, payload) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (ALLOWED_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN
  }
  res.writeHead(statusCode, headers)
  res.end(JSON.stringify(payload))
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = ''
    let aborted = false
    req.on('error', (err) => {
      if (aborted) return
      aborted = true
      reject(err)
    })
    req.on('data', (chunk) => {
      if (aborted) return
      body += chunk
      if (body.length > MAX_BODY_BYTES) {
        aborted = true
        req.destroy()
        reject(new Error('BODY_TOO_LARGE'))
      }
    })
    req.on('end', () => {
      if (aborted) return
      if (!body) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(err)
      }
    })
  })

const buildPlayerResponse = (player) => ({
  username: player.username,
  stats: player.stats,
})

const server = http.createServer(async (req, res) => {
  const { pathname } = parse(req.url || '', true)

  if (req.method === 'OPTIONS') {
    jsonResponse(res, 204, {})
    return
  }

  if (req.method === 'GET' && pathname === '/health') {
    jsonResponse(res, 200, { status: 'ok' })
    return
  }

  if (req.method === 'GET' && pathname === '/players') {
    const data = loadData()
    const players = Object.values(data.players || {}).map(buildPlayerResponse)
    jsonResponse(res, 200, { players })
    return
  }

  if (req.method === 'POST' && pathname === '/auth/sign-in') {
    try {
      if (isRateLimited(req)) {
        jsonResponse(res, 429, { error: 'Too many attempts.' })
        return
      }
      const body = await readBody(req)
      const username = normalizeUsername(String(body.username || ''))
      const password = String(body.password || '')
      if (!username) {
        jsonResponse(res, 400, { error: 'Username is required.' })
        return
      }
      if (!USERNAME_PATTERN.test(username)) {
        jsonResponse(res, 400, { error: 'Use only letters, numbers, dashes, and underscores.' })
        return
      }
      if (!password) {
        jsonResponse(res, 400, { error: 'Password is required.' })
        return
      }

      const result = await withDataLock(async () => {
        const data = loadData()
        const existing = data.players[username]
        if (existing) {
          const hashed = await hashPassword(password, existing.salt)
          if (hashed !== existing.passwordHash) {
            return { status: 401, payload: { error: 'Incorrect password.' } }
          }
          return { status: 200, payload: { player: buildPlayerResponse(existing) } }
        }

        const salt = createSalt()
        const passwordHash = await hashPassword(password, salt)
        const player = {
          username,
          salt,
          passwordHash,
          stats: { games: 0, wins: 0, losses: 0, draws: 0 },
        }
        data.players[username] = player
        await saveData(data)
        return { status: 200, payload: { player: buildPlayerResponse(player) } }
      })
      jsonResponse(res, result.status, result.payload)
    } catch (err) {
      if (err instanceof Error && err.message === 'BODY_TOO_LARGE') {
        jsonResponse(res, 413, { error: 'Payload too large.' })
        return
      }
      jsonResponse(res, 400, { error: 'Invalid JSON payload.' })
    }
    return
  }

  const resultMatch = pathname?.match(/^\/players\/([^/]+)\/result$/)
  if (req.method === 'POST' && resultMatch) {
    try {
      const body = await readBody(req)
      const result = String(body.result || '')
      const username = normalizeUsername(resultMatch[1] || '')
      if (!username || !USERNAME_PATTERN.test(username)) {
        jsonResponse(res, 400, { error: 'Invalid username.' })
        return
      }
      if (!['win', 'loss', 'draw'].includes(result)) {
        jsonResponse(res, 400, { error: 'Invalid result.' })
        return
      }

      const resultPayload = await withDataLock(async () => {
        const data = loadData()
        const player = data.players[username]
        if (!player) {
          return { status: 404, payload: { error: 'Player not found.' } }
        }

        player.stats.games += 1
        if (result === 'win') player.stats.wins += 1
        if (result === 'loss') player.stats.losses += 1
        if (result === 'draw') player.stats.draws += 1

        await saveData(data)
        return { status: 200, payload: { player: buildPlayerResponse(player) } }
      })
      jsonResponse(res, resultPayload.status, resultPayload.payload)
    } catch (err) {
      if (err instanceof Error && err.message === 'BODY_TOO_LARGE') {
        jsonResponse(res, 413, { error: 'Payload too large.' })
        return
      }
      jsonResponse(res, 400, { error: 'Invalid JSON payload.' })
    }
    return
  }

  jsonResponse(res, 404, { error: 'Not found.' })
})

server.listen(PORT, () => {
  console.log(`Chess backend listening on ${PORT}`)
})
