import { Chess } from 'chess.js'
import { TIME_CONTROLS } from '@/lib/constants'
import type { Game, GameState, Move } from '@/types/database'

export interface GameOptions {
  timeControlName: string
  colorPreference: 'white' | 'black' | 'random'
  hostPlayerId: string
}

export function createInitialGame(gameId: string, options: GameOptions): { game: Game, gameState: GameState } {
  const defaultTimeControl = TIME_CONTROLS.find(tc => tc.name === '10+0') || TIME_CONTROLS[0]
  const timeControl = TIME_CONTROLS.find(tc => tc.name === options.timeControlName) || defaultTimeControl

  const now = new Date().toISOString()

  let whitePlayerId: string | null = null
  let blackPlayerId: string | null = null

  if (options.colorPreference === 'white') {
    whitePlayerId = options.hostPlayerId
  } else if (options.colorPreference === 'black') {
    blackPlayerId = options.hostPlayerId
  } else {
    // Random
    if (Math.random() > 0.5) {
      whitePlayerId = options.hostPlayerId
    } else {
      blackPlayerId = options.hostPlayerId
    }
  }

  const game: Game = {
    id: gameId,
    status: 'waiting',
    time_control: timeControl.name,
    initial_time_ms: timeControl.initialTimeMs,
    increment_ms: timeControl.incrementMs,
    white_player_id: whitePlayerId,
    black_player_id: blackPlayerId,
    result: null,
    result_reason: null,
    created_at: now,
    started_at: null,
    ended_at: null,
  }

  const gameState: GameState = {
    id: 0, // Placeholder
    game_id: gameId,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    pgn: '',
    move_index: 0,
    turn: 'w',
    white_time_ms: timeControl.initialTimeMs,
    black_time_ms: timeControl.initialTimeMs,
    last_move_at: null,
    is_check: false,
    is_checkmate: false,
    is_stalemate: false,
    is_draw: false,
    draw_reason: null,
    last_move_san: null,
    last_move_from: null,
    last_move_to: null,
    updated_at: now,
  }

  return { game, gameState }
}

export function processMove(
  game: Game,
  gameState: GameState,
  moveData: { from: string; to: string; promotion?: string }
): {
  success: boolean,
  error?: string,
  newGameState?: GameState,
  newMove?: Move,
  gameUpdate?: Partial<Game>
} {
  const chess = new Chess(gameState.fen)

  try {
    const move = chess.move({
      from: moveData.from,
      to: moveData.to,
      promotion: moveData.promotion
    })

    if (!move) return { success: false, error: 'Invalid move' }

    const now = new Date().toISOString()
    const isWhite = gameState.turn === 'w'

    // Time calculation
    let newWhiteTime = gameState.white_time_ms
    let newBlackTime = gameState.black_time_ms

    let timeoutUpdate: Partial<Game> | null = null

    // Only deduct time if game is active and not the first move of the game
    if (gameState.last_move_at) {
      const timeSinceLastMove = Date.now() - new Date(gameState.last_move_at).getTime()

      if (isWhite) {
        const timeAfterDeduction = gameState.white_time_ms - timeSinceLastMove
        if (timeAfterDeduction <= 0) {
          newWhiteTime = 0
          timeoutUpdate = {
            status: 'completed',
            result: 'black',
            result_reason: 'timeout',
            ended_at: now,
          }
        } else {
          newWhiteTime = timeAfterDeduction + game.increment_ms
        }
      } else {
        const timeAfterDeduction = gameState.black_time_ms - timeSinceLastMove
        if (timeAfterDeduction <= 0) {
          newBlackTime = 0
          timeoutUpdate = {
            status: 'completed',
            result: 'white',
            result_reason: 'timeout',
            ended_at: now,
          }
        } else {
          newBlackTime = timeAfterDeduction + game.increment_ms
        }
      }
    } else if (game.started_at && isWhite) {
      const timeSinceStart = Date.now() - new Date(game.started_at).getTime()
      const timeAfterDeduction = gameState.white_time_ms - timeSinceStart
      if (timeAfterDeduction <= 0) {
        newWhiteTime = 0
        timeoutUpdate = {
          status: 'completed',
          result: 'black',
          result_reason: 'timeout',
          ended_at: now,
        }
      } else {
        newWhiteTime = timeAfterDeduction + game.increment_ms
      }
    }

    // Check game end conditions
    const isCheckmate = chess.isCheckmate()
    const isStalemate = chess.isStalemate()
    const isDraw = chess.isDraw()
    let drawReason: string | null = null

    if (isDraw && !isStalemate) {
      if (chess.isThreefoldRepetition()) drawReason = 'threefold'
      else if (chess.isInsufficientMaterial()) drawReason = 'insufficient'
      else drawReason = 'fifty_move'
    }

    const newGameState: GameState = {
      ...gameState,
      fen: chess.fen(),
      pgn: chess.pgn(),
      move_index: gameState.move_index + 1,
      turn: chess.turn(),
      white_time_ms: newWhiteTime,
      black_time_ms: newBlackTime,
      last_move_at: now,
      is_check: chess.isCheck(),
      is_checkmate: isCheckmate,
      is_stalemate: isStalemate,
      is_draw: isDraw,
      draw_reason: drawReason,
      last_move_san: move.san,
      last_move_from: moveData.from,
      last_move_to: moveData.to,
      updated_at: now,
    }

    const newMove: Move = {
      id: gameState.move_index + 1, // Simple increment
      game_id: game.id,
      move_index: gameState.move_index + 1,
      san: move.san,
      uci: `${moveData.from}${moveData.to}${moveData.promotion || ''}`,
      fen_after: chess.fen(),
      played_by: isWhite ? 'white' : 'black',
      time_remaining_ms: isWhite ? newWhiteTime : newBlackTime,
      played_at: now
    }

    let gameUpdate: Partial<Game> | undefined = undefined

    if (timeoutUpdate) {
      gameUpdate = timeoutUpdate
    } else if (isCheckmate || isStalemate || isDraw) {
      let result: string | null = null
      let resultReason: string | null = null

      if (isCheckmate) {
        result = isWhite ? 'white' : 'black'
        resultReason = 'checkmate'
      } else if (isStalemate) {
        result = 'draw'
        resultReason = 'stalemate'
      } else if (isDraw) {
        result = 'draw'
        resultReason = drawReason
      }

      gameUpdate = {
        status: 'completed',
        result,
        result_reason: resultReason,
        ended_at: now,
      }
    }

    return { success: true, newGameState, newMove, gameUpdate }

  } catch (err) {
    console.error('Error processing move:', err)
    return { success: false, error: 'Move processing failed' }
  }
}

export function tryJoinGame(game: Game, playerId: string, requestColor?: 'white' | 'black'): { success: boolean, game?: Game, color?: 'white' | 'black' } {
  // If player is already in the game
  if (game.white_player_id === playerId) return { success: true, game, color: 'white' }
  if (game.black_player_id === playerId) return { success: true, game, color: 'black' }

  // Try to assign requested color
  if (requestColor === 'white' && !game.white_player_id) {
    const newGame = { ...game, white_player_id: playerId }
    return { success: true, game: checkStartGame(newGame), color: 'white' }
  }

  if (requestColor === 'black' && !game.black_player_id) {
    const newGame = { ...game, black_player_id: playerId }
    return { success: true, game: checkStartGame(newGame), color: 'black' }
  }

  // Assign any open slot
  if (!game.white_player_id) {
    const newGame = { ...game, white_player_id: playerId }
    return { success: true, game: checkStartGame(newGame), color: 'white' }
  }

  if (!game.black_player_id) {
    const newGame = { ...game, black_player_id: playerId }
    return { success: true, game: checkStartGame(newGame), color: 'black' }
  }

  return { success: false } // Full
}

function checkStartGame(game: Game): Game {
  if (game.white_player_id && game.black_player_id && game.status === 'waiting') {
    return {
      ...game,
      status: 'active',
      started_at: new Date().toISOString()
    }
  }
  return game
}
