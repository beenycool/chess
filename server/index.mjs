import http from 'node:http'
import { parse } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const parsedPort = Number.parseInt(process.env.PORT || '', 10)
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : 4000
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, 'data', 'players.json')
const PASSWORD_ITERATIONS = 600_000
const USERNAME_PATTERN = /^[a-z0-9_-]+$/
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*'
const parsedBodyLimit = Number.parseInt(process.env.MAX_BODY_BYTES || '', 10)
const MAX_BODY_BYTES = Number.isInteger(parsedBodyLimit) && parsedBodyLimit > 0 ? parsedBodyLimit : 1024 * 1024

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

const saveData = (data) => {
  ensureDataDir()
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
}

const normalizeUsername = (username) => username.trim().toLowerCase()

const hashPassword = (password, salt) =>
  crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), PASSWORD_ITERATIONS, 32, 'sha256').toString('hex')

const createSalt = () => crypto.randomBytes(16).toString('hex')

const jsonResponse = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(payload))
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('BODY_TOO_LARGE'))
        req.destroy()
      }
    })
    req.on('end', () => {
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

      const data = loadData()
      const existing = data.players[username]
      if (existing) {
        const hashed = hashPassword(password, existing.salt)
        if (hashed !== existing.passwordHash) {
          jsonResponse(res, 401, { error: 'Incorrect password.' })
          return
        }
        jsonResponse(res, 200, { player: buildPlayerResponse(existing) })
        return
      }

      const salt = createSalt()
      const passwordHash = hashPassword(password, salt)
      const player = {
        username,
        salt,
        passwordHash,
        stats: { games: 0, wins: 0, losses: 0, draws: 0 },
      }
      data.players[username] = player
      saveData(data)
      jsonResponse(res, 200, { player: buildPlayerResponse(player) })
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

      const data = loadData()
      const player = data.players[username]
      if (!player) {
        jsonResponse(res, 404, { error: 'Player not found.' })
        return
      }

      player.stats.games += 1
      if (result === 'win') player.stats.wins += 1
      if (result === 'loss') player.stats.losses += 1
      if (result === 'draw') player.stats.draws += 1

      saveData(data)
      jsonResponse(res, 200, { player: buildPlayerResponse(player) })
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
