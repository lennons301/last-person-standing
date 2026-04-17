import { notFound } from 'next/navigation'
import { ClassicPick } from '@/components/picks/classic-pick'
import { ProgressGrid } from '@/components/standings/progress-grid'
import { requireSession } from '@/lib/auth-helpers'
import { getClassicPickData, getGameDetail, getProgressGridData } from '@/lib/game/detail-queries'

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const session = await requireSession()
	const { id } = await params
	const game = await getGameDetail(id, session.user.id)
	if (!game) notFound()

	if (!game.isMember) {
		// Not a member — show a basic view (could redirect to join, but keep simple)
		return (
			<div className="text-center py-12">
				<h1 className="font-display text-xl font-semibold">{game.name}</h1>
				<p className="text-muted-foreground mt-2">You're not a member of this game.</p>
			</div>
		)
	}

	const pickData =
		game.currentRound && game.myMembership && game.gameMode === 'classic'
			? await getClassicPickData(game.id, game.currentRound.id, game.myMembership.id)
			: null

	const gridData = await getProgressGridData(game.id)

	return (
		<div>
			<div className="mb-4">
				<h1 className="font-display text-2xl font-semibold">{game.name}</h1>
				<p className="text-sm text-muted-foreground">
					{game.gameMode[0].toUpperCase() + game.gameMode.slice(1)} · {game.competition.name}
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-[1fr_400px] gap-6">
				<div>
					{game.gameMode === 'classic' ? (
						pickData && game.currentRound && game.myMembership?.status === 'alive' ? (
							<ClassicPick
								gameId={game.id}
								roundId={game.currentRound.id}
								roundName={pickData.roundName}
								deadline={pickData.deadline}
								fixtures={pickData.fixtures}
								usedTeamsByRound={pickData.usedTeamsByRound}
								existingPickTeamId={pickData.existingPickTeamId}
							/>
						) : (
							<div className="p-6 rounded-lg border border-border bg-card text-center text-muted-foreground">
								{game.myMembership?.status === 'eliminated'
									? 'You have been eliminated from this game.'
									: game.status === 'completed'
										? 'This game has ended.'
										: 'Waiting for the next round.'}
							</div>
						)
					) : (
						<div className="p-6 rounded-lg border border-border bg-card text-center text-muted-foreground">
							<p className="font-display text-lg font-semibold mb-1">
								{game.gameMode[0].toUpperCase() + game.gameMode.slice(1)} mode
							</p>
							<p className="text-sm">The pick interface for this mode is coming soon.</p>
						</div>
					)}
				</div>
				<div className="md:border-l md:pl-6">
					{gridData && (
						<ProgressGrid
							rounds={gridData.rounds}
							players={gridData.players}
							aliveCount={gridData.aliveCount}
							eliminatedCount={gridData.eliminatedCount}
							pot={gridData.pot}
						/>
					)}
				</div>
			</div>
		</div>
	)
}
