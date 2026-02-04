'use client'

import { useGameStore } from '@/store/game-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'

export function MoveHistory() {
  const { moves } = useGameStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Group moves into pairs (white, black)
  const movePairs: { moveNumber: number; white?: string; black?: string }[] = []
  
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i]
    const pairIndex = Math.floor((move.move_index - 1) / 2)
    
    if (!movePairs[pairIndex]) {
      movePairs[pairIndex] = { moveNumber: pairIndex + 1 }
    }
    
    if (move.played_by === 'white') {
      movePairs[pairIndex].white = move.san
    } else {
      movePairs[pairIndex].black = move.san
    }
  }

  // Auto-scroll to bottom on new moves
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [moves.length])

  if (moves.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No moves yet
      </div>
    )
  }

  return (
    <ScrollArea className="h-full" ref={scrollRef}>
      <div className="space-y-1 p-2">
        {movePairs.map((pair, idx) => (
          <div
            key={pair.moveNumber}
            className={cn(
              'flex items-center gap-2 text-sm font-mono rounded px-2 py-1',
              idx % 2 === 0 ? 'bg-slate-800' : 'bg-slate-850'
            )}
          >
            <span className="text-slate-500 w-8">{pair.moveNumber}.</span>
            <span className="flex-1 text-white">{pair.white || '...'}</span>
            <span className="flex-1 text-slate-300">{pair.black || ''}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
