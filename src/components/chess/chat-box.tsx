'use client'

import { useState, useRef, useEffect } from 'react'
import { useGameStore } from '@/store/game-store'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'

interface ChatBoxProps {
  onSendMessage: (text: string) => void
}

export function ChatBox({ onSendMessage }: ChatBoxProps) {
  const { chatMessages, playerId } = useGameStore()
  const [inputText, setInputText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const MAX_MESSAGE_LENGTH = 500

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatMessages])

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return
    onSendMessage(trimmed)
    setInputText('')
  }

  return (
    <Card className="flex flex-col h-[300px]">
      <CardHeader className="py-2 px-4 border-b">
        <CardTitle className="text-sm font-medium">Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
        {chatMessages.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground mt-4">
            No messages yet. Say hi!
          </div>
        ) : (
          chatMessages.map((msg) => {
            const isMe = msg.senderId === playerId
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    isMe
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {!isMe && (
                    <div className="text-[10px] opacity-70 font-semibold mb-1">
                      {msg.senderName}
                    </div>
                  )}
                  {msg.text}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
      <CardFooter className="p-2 border-t">
        <form onSubmit={handleSend} className="flex w-full gap-2">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            placeholder="Type a message..."
            className="h-8 text-sm"
            maxLength={MAX_MESSAGE_LENGTH}
          />
          <Button type="submit" size="sm" className="h-8 px-3">
            <Send className="w-3 h-3" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}
