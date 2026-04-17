import { and, eq, ne } from 'drizzle-orm'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/db'
import { game, gamePlayer } from '@/lib/schema/game'
import { GameSwitcher } from './game-switcher'
import { UserMenu } from './user-menu'

interface NavbarProps {
	userName: string
	userId: string
	currentGameId?: string
}

export async function Navbar({ userName, userId, currentGameId }: NavbarProps) {
	const myGames = await db
		.select({ id: game.id, name: game.name })
		.from(gamePlayer)
		.innerJoin(game, eq(gamePlayer.gameId, game.id))
		.where(and(eq(gamePlayer.userId, userId), ne(game.status, 'completed')))

	return (
		<header className="border-b bg-background sticky top-0 z-40">
			<div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
				<div className="flex items-center gap-3">
					<Link href="/" className="font-display font-bold text-lg">
						<span className="hidden sm:inline">Last Person Standing</span>
						<span className="sm:hidden">LPS</span>
					</Link>
					{myGames.length > 0 && <GameSwitcher currentGameId={currentGameId} games={myGames} />}
				</div>
				<div className="flex items-center gap-2">
					<Button asChild variant="ghost" size="sm" className="gap-1.5">
						<Link href="/game/create">
							<Plus className="h-4 w-4" />
							<span className="hidden sm:inline">New game</span>
						</Link>
					</Button>
					<UserMenu name={userName} />
				</div>
			</div>
		</header>
	)
}
