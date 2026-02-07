'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { AuthModal } from '@/components/auth/auth-modal'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Trophy, User as UserIcon, LogOut, Swords } from 'lucide-react'

export function Navbar() {
  const { user, profile, signOut } = useAuth()

  return (
    <nav className="border-b bg-card sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold flex items-center gap-2 group">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-lg group-hover:rotate-12 transition-transform">
            <Swords className="w-5 h-5" />
          </div>
          <span className="tracking-tight">ChessFriends</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/leaderboard">
            <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-500" />
              Leaderboard
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden">
              <Trophy className="w-4 h-4 text-yellow-500" />
            </Button>
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2 pl-1 pr-3">
                  <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center font-bold text-xs">
                    {profile?.username?.[0].toUpperCase() || 'U'}
                  </div>
                  <span className="max-w-[100px] truncate hidden xs:inline">
                    {profile?.username || 'Profile'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b mb-1">
                  Logged in as <span className="font-medium text-foreground">{profile?.username}</span>
                </div>
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="cursor-pointer flex items-center gap-2">
                    <UserIcon className="w-4 h-4" />
                    My Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="sm:hidden">
                  <Link href="/leaderboard" className="cursor-pointer flex items-center gap-2">
                    <Trophy className="w-4 h-4" />
                    Leaderboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer text-destructive focus:text-destructive flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <AuthModal />
          )}
        </div>
      </div>
    </nav>
  )
}
