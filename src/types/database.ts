export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      games: {
        Row: {
          id: string
          status: string
          time_control: string
          initial_time_ms: number
          increment_ms: number
          white_player_id: string | null
          black_player_id: string | null
          result: string | null
          result_reason: string | null
          created_at: string
          started_at: string | null
          ended_at: string | null
        }
        Insert: {
          id: string
          status?: string
          time_control?: string
          initial_time_ms?: number
          increment_ms?: number
          white_player_id?: string | null
          black_player_id?: string | null
          result?: string | null
          result_reason?: string | null
          created_at?: string
          started_at?: string | null
          ended_at?: string | null
        }
        Update: {
          id?: string
          status?: string
          time_control?: string
          initial_time_ms?: number
          increment_ms?: number
          white_player_id?: string | null
          black_player_id?: string | null
          result?: string | null
          result_reason?: string | null
          created_at?: string
          started_at?: string | null
          ended_at?: string | null
        }
      }
      game_states: {
        Row: {
          id: number
          game_id: string
          fen: string
          pgn: string
          move_index: number
          turn: string
          white_time_ms: number
          black_time_ms: number
          last_move_at: string | null
          is_check: boolean
          is_checkmate: boolean
          is_stalemate: boolean
          is_draw: boolean
          draw_reason: string | null
          last_move_san: string | null
          last_move_from: string | null
          last_move_to: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          game_id: string
          fen?: string
          pgn?: string
          move_index?: number
          turn?: string
          white_time_ms: number
          black_time_ms: number
          last_move_at?: string | null
          is_check?: boolean
          is_checkmate?: boolean
          is_stalemate?: boolean
          is_draw?: boolean
          draw_reason?: string | null
          last_move_san?: string | null
          last_move_from?: string | null
          last_move_to?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          game_id?: string
          fen?: string
          pgn?: string
          move_index?: number
          turn?: string
          white_time_ms?: number
          black_time_ms?: number
          last_move_at?: string | null
          is_check?: boolean
          is_checkmate?: boolean
          is_stalemate?: boolean
          is_draw?: boolean
          draw_reason?: string | null
          last_move_san?: string | null
          last_move_from?: string | null
          last_move_to?: string | null
          updated_at?: string
        }
      }
      moves: {
        Row: {
          id: number
          game_id: string
          move_index: number
          san: string
          uci: string
          fen_after: string
          played_by: string
          time_remaining_ms: number
          played_at: string
        }
        Insert: {
          id?: number
          game_id: string
          move_index: number
          san: string
          uci: string
          fen_after: string
          played_by: string
          time_remaining_ms: number
          played_at?: string
        }
        Update: {
          id?: number
          game_id?: string
          move_index?: number
          san?: string
          uci?: string
          fen_after?: string
          played_by?: string
          time_remaining_ms?: number
          played_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

export type Game = Database['public']['Tables']['games']['Row']
export type GameState = Database['public']['Tables']['game_states']['Row']
export type Move = Database['public']['Tables']['moves']['Row']
