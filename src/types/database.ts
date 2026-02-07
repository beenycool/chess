export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      game_states: {
        Row: {
          black_time_ms: number
          draw_reason: string | null
          fen: string
          game_id: string
          id: number
          is_check: boolean
          is_checkmate: boolean
          is_draw: boolean
          is_stalemate: boolean
          last_move_at: string | null
          last_move_from: string | null
          last_move_san: string | null
          last_move_to: string | null
          move_index: number
          pgn: string
          turn: string
          updated_at: string
          white_time_ms: number
        }
        Insert: {
          black_time_ms: number
          draw_reason?: string | null
          fen?: string
          game_id: string
          id?: number
          is_check?: boolean
          is_checkmate?: boolean
          is_draw?: boolean
          is_stalemate?: boolean
          last_move_at?: string | null
          last_move_from?: string | null
          last_move_san?: string | null
          last_move_to?: string | null
          move_index?: number
          pgn?: string
          turn?: string
          updated_at?: string
          white_time_ms: number
        }
        Update: {
          black_time_ms?: number
          draw_reason?: string | null
          fen?: string
          game_id?: string
          id?: number
          is_check?: boolean
          is_checkmate?: boolean
          is_draw?: boolean
          is_stalemate?: boolean
          last_move_at?: string | null
          last_move_from?: string | null
          last_move_san?: string | null
          last_move_to?: string | null
          move_index?: number
          pgn?: string
          turn?: string
          updated_at?: string
          white_time_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_states_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          black_id: string | null
          black_player_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          increment_ms: number
          initial_time_ms: number
          result: string | null
          result_reason: string | null
          started_at: string | null
          status: string
          time_control: string
          white_id: string | null
          white_player_id: string | null
        }
        Insert: {
          black_id?: string | null
          black_player_id?: string | null
          created_at?: string
          ended_at?: string | null
          id: string
          increment_ms?: number
          initial_time_ms?: number
          result?: string | null
          result_reason?: string | null
          started_at?: string | null
          status?: string
          time_control?: string
          white_id?: string | null
          white_player_id?: string | null
        }
        Update: {
          black_id?: string | null
          black_player_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          increment_ms?: number
          initial_time_ms?: number
          result?: string | null
          result_reason?: string | null
          started_at?: string | null
          status?: string
          time_control?: string
          white_id?: string | null
          white_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_black_id_fkey"
            columns: ["black_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_white_id_fkey"
            columns: ["white_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moves: {
        Row: {
          fen_after: string
          game_id: string
          id: number
          move_index: number
          played_at: string
          played_by: string
          san: string
          time_remaining_ms: number
          uci: string
        }
        Insert: {
          fen_after: string
          game_id: string
          id?: number
          move_index: number
          played_at?: string
          played_by: string
          san: string
          time_remaining_ms: number
          uci: string
        }
        Update: {
          fen_after?: string
          game_id?: string
          id?: number
          move_index?: number
          played_at?: string
          played_by?: string
          san?: string
          time_remaining_ms?: number
          uci?: string
        }
        Relationships: [
          {
            foreignKeyName: "moves_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          draws: number
          elo: number
          id: string
          losses: number
          username: string
          wins: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          draws?: number
          elo?: number
          id: string
          losses?: number
          username: string
          wins?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          draws?: number
          elo?: number
          id?: string
          losses?: number
          username?: string
          wins?: number
        }
        Relationships: []
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
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Game = Database['public']['Tables']['games']['Row']
export type GameState = Database['public']['Tables']['game_states']['Row']
export type Move = Database['public']['Tables']['moves']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
