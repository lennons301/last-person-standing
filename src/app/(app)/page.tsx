import Link from 'next/link'
import { GameCard } from '@/components/game/game-card'
import { PastGamesSection } from '@/components/game/past-games-section'
import { Button } from '@/components/ui/button'
import { requireSession } from '@/lib/auth-helpers'
import { getMyGames } from '@/lib/game/queries'

export default async function DashboardPage() {
	const session = await requireSession()
	const games = await getMyGames(session.user.id)

	const activeGames = games.filter((g) => g.status !== 'completed' && g.myStatus !== 'eliminated')
	const inactiveGames = games.filter((g) => g.status === 'completed' || g.myStatus === 'eliminated')

	const firstName = session.user.name.split(' ')[0]
	const picksNeeded = activeGames.filter((g) => !g.myPickSubmitted).length

	if (games.length === 0) {
		return (
			<div className="max-w-md mx-auto text-center py-12">
				<h1 className="font-display text-2xl font-semibold mb-2">Welcome, {firstName}</h1>
				<p className="text-muted-foreground mb-6">You&apos;re not in any games yet.</p>
				<Button asChild size="lg">
					<Link href="/game/create">Create your first game</Link>
				</Button>
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
