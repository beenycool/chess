'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGameStore } from '@/store/game-store'

interface ChatBoxProps {
  onSendMessage: (text: string) => void
}

export function ChatBox({ onSendMessage }: ChatBoxProps) {
  const { chatMessages, playerId } = useGameStore()
  const [inputText, setInputText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatMessages])

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim()) return

    onSendMessage(inputText)
    setInputText('')
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="py-3 px-4 border-b">
        <CardTitle className="text-sm font-medium">Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-3 gap-2 min-h-[200px]">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-3 pr-2"
        >
          {chatMessages.length === 0 ? (
             <div className="text-xs text-muted-foreground text-center py-4">
               No messages yet. Say hi!
             </div>
          ) : (
            chatMessages.map((msg) => {
              const isMe = msg.sender === playerId
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                      isMe
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })
          )}
        </div>
        <form onSubmit={handleSend} className="flex gap-2 pt-2 border-t">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="h-9 text-sm"
          />
          <Button type="submit" size="sm" className="h-9 px-3">
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
