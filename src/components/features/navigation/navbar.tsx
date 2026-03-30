import Link from "next/link"
import { UserMenu } from "./user-menu"

export function Navbar({ displayName }: { displayName: string }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="font-semibold tracking-tight">
          Last Person Standing
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/games"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Games
          </Link>
          <UserMenu displayName={displayName} />
        </nav>
      </div>
    </header>
  )
}
