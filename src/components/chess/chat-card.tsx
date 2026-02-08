'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGameStore } from '@/store/game-store'

interface ChatCardProps {
  onSendMessage: (text: string) => void
  disabled?: boolean
}

export function ChatCard({ onSendMessage, disabled = false }: ChatCardProps) {
  const { chatMessages } = useGameStore()
  const [inputText, setInputText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || disabled) return
    onSendMessage(inputText.trim())
    setInputText('')
  }

  const formatTime = (timestamp: number) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(timestamp))
  }

  return (
    <Card className="flex flex-col h-[300px] lg:h-[400px]">
      <CardHeader className="py-3 px-4 border-b">
        <CardTitle className="text-sm font-medium">In-Game Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 flex flex-col min-h-0 overflow-hidden">
        <ScrollArea className="flex-1 p-4 h-full">
          <div className="space-y-4 pr-4">
            {chatMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No messages yet. Say hi!
              </p>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold">{msg.sender}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm bg-muted/50 p-2 rounded-md break-words">
                    {msg.text}
                  </p>
                </div>
              ))
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
        <div className="p-3 border-t bg-background">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..."
              disabled={disabled}
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" disabled={disabled || !inputText.trim()} className="h-8">
              Send
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
