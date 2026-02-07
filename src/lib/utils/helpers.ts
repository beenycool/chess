import { nanoid } from 'nanoid'

export function getOrCreatePlayerId(userId?: string): string {
  // If user is logged in, use their Supabase user ID
  if (userId) {
    return userId
  }
  
  // For guests, generate a random ID (in-memory only, not stored)
  return nanoid(12)
}

export function formatTime(ms: number): string {
  if (ms <= 0) return '0:00'
  
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatTimeWithTenths(ms: number): string {
  if (ms <= 0) return '0:00.0'
  
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const tenths = Math.floor((ms % 1000) / 100)
  
  // Only show tenths when under 20 seconds
  if (totalSeconds < 20) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`
  }
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text)
  }
  
  // Fallback for older browsers
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
  return Promise.resolve()
}

export function generateGameId(): string {
  return nanoid(10)
}
