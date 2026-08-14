import Link from 'next/link'
import { GameCard } from '@/components/game/game-card'
import { InProgressGamesSection } from '@/components/game/in-progress-games-section'
import { OpenGamesSection } from '@/components/game/open-games-section'
import { PastGamesSection } from '@/components/game/past-games-section'
import { Button } from '@/components/ui/button'
import { requireSession } from '@/lib/auth-helpers'
import { getDiscoverableGames } from '@/lib/game/discover-query'
import { buildDiscoverView } from '@/lib/game/discover-view'
import { getMyGames } from '@/lib/game/queries'

export default async function DashboardPage() {
	const session = await requireSession()
	const [games, discoverable] = await Promise.all([
		getMyGames(session.user.id),
		getDiscoverableGames(session.user.id),
	])

	// Public games the viewer isn't in: the ones they can join, and the ones that
	// have started. Every rule about what's listed lives in the builder.
	const discover = buildDiscoverView({ games: discoverable, now: new Date() })

	const activeGames = games.filter((g) => g.status !== 'completed' && g.myStatus !== 'eliminated')
	const inactiveGames = games.filter((g) => g.status === 'completed' || g.myStatus === 'eliminated')

	const firstName = session.user.name.split(' ')[0]
	const picksNeeded = activeGames.filter((g) => !g.myPickSubmitted).length

	// A player in no games at all lands on the games they could join rather than a
	// create-a-game dead end — the whole point of making games findable. Creating
	// one stays on offer below them, and if there is nothing public to show, this
	// is the old empty state exactly.
	if (games.length === 0) {
		return (
			<div>
				<div className="max-w-md mx-auto text-center py-8">
					<h1 className="font-display text-2xl font-semibold mb-2">Welcome, {firstName}</h1>
					<p className="text-muted-foreground mb-6">
						{discover.openToJoin.length > 0
							? "You're not in any games yet — here's what's open."
							: "You're not in any games yet."}
					</p>
					<Button
						asChild
						size="lg"
						variant={discover.openToJoin.length > 0 ? 'outline' : 'default'}
					>
						<Link href="/game/create">Create a game</Link>
					</Button>
				</div>

				<OpenGamesSection games={discover.openToJoin} />
				<InProgressGamesSection games={discover.inProgress} />
			</div>
		)
	}

	return (
		<div>
			<div className="mb-6">
				<h1 className="font-display text-2xl font-semibold">
					{greeting()}, {firstName}
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{activeGames.length} {activeGames.length === 1 ? 'game' : 'games'} active
					{picksNeeded > 0 && ` · ${picksNeeded} ${picksNeeded === 1 ? 'pick' : 'picks'} needed`}
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
				{activeGames.map((g) => (
					<GameCard key={g.id} game={g} />
				))}
			</div>

			<OpenGamesSection games={discover.openToJoin} />
			<InProgressGamesSection games={discover.inProgress} />
			<PastGamesSection games={inactiveGames} />
		</div>
	)
}

function greeting(): string {
	const hour = new Date().getHours()
	if (hour < 12) return 'Morning'
	if (hour < 18) return 'Afternoon'
	return 'Evening'
}
