export interface TimeControl {
  name: string
  label: string
  initialTimeMs: number
  incrementMs: number
}

export const TIME_CONTROLS: TimeControl[] = [
  { name: '1+0', label: 'Bullet 1 min', initialTimeMs: 60000, incrementMs: 0 },
  { name: '2+1', label: 'Bullet 2+1', initialTimeMs: 120000, incrementMs: 1000 },
  { name: '3+0', label: 'Blitz 3 min', initialTimeMs: 180000, incrementMs: 0 },
  { name: '3+2', label: 'Blitz 3+2', initialTimeMs: 180000, incrementMs: 2000 },
  { name: '5+0', label: 'Blitz 5 min', initialTimeMs: 300000, incrementMs: 0 },
  { name: '5+3', label: 'Blitz 5+3', initialTimeMs: 300000, incrementMs: 3000 },
  { name: '10+0', label: 'Rapid 10 min', initialTimeMs: 600000, incrementMs: 0 },
  { name: '10+5', label: 'Rapid 10+5', initialTimeMs: 600000, incrementMs: 5000 },
  { name: '15+10', label: 'Rapid 15+10', initialTimeMs: 900000, incrementMs: 10000 },
  { name: '30+0', label: 'Classical 30 min', initialTimeMs: 1800000, incrementMs: 0 },
]

export const DEFAULT_TIME_CONTROL = TIME_CONTROLS[6] // 10+0

/** Time after which a waiting room is hidden from lobby and can be marked expired (ms). */
export const WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes

export type PlayerColor = 'white' | 'black' | null
export type GameStatus = 'waiting' | 'active' | 'completed' | 'expired'
export type GameResult = 'white' | 'black' | 'draw' | null
export type ResultReason = 
  | 'checkmate' 
  | 'timeout' 
  | 'resignation' 
  | 'stalemate' 
  | 'draw_agreement' 
  | 'insufficient' 
  | 'threefold' 
  | 'fifty_move'
  | null
