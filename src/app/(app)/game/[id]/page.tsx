import { notFound } from 'next/navigation'
import { GameDetailView } from '@/components/game/game-detail-view'
import { ClassicPick } from '@/components/picks/classic-pick'
import { TurboPick } from '@/components/picks/turbo-pick'
import { requireSession } from '@/lib/auth-helpers'
import {
	getClassicPickData,
	getGameDetail,
	getProgressGridData,
	getTurboPickData,
	getTurboStandingsData,
} from '@/lib/game/detail-queries'

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const session = await requireSession()
	const { id } = await params
	const game = await getGameDetail(id, session.user.id)
	if (!game) notFound()

	if (!game.isMember) {
		return (
			<div className="text-center py-12">
				<h1 className="font-display text-xl font-semibold">{game.name}</h1>
				<p className="text-muted-foreground mt-2">You're not a member of this game.</p>
			</div>
		)
	}

	const classicPickData =
		game.currentRound && game.myMembership && game.gameMode === 'classic'
			? await getClassicPickData(game.id, game.currentRound.id, game.myMembership.id)
			: null

	const turboPickData =
		game.currentRound && game.myMembership && game.gameMode === 'turbo'
			? await getTurboPickData(game.id, game.currentRound.id, game.myMembership.id)
			: null

	const numberOfPicks =
		(game as unknown as { modeConfig?: { numberOfPicks?: number } }).modeConfig?.numberOfPicks ?? 10

	const classicGrid =
		game.gameMode === 'classic' ? await getProgressGridData(game.id, session.user.id) : null
	const turboStandingsData =
		game.gameMode === 'turbo' ? await getTurboStandingsData(game.id, session.user.id) : null

	const isAlive = game.myMembership?.status === 'alive'
	const aliveCount = game.players.filter((p) => p.status === 'alive').length

	const pickSection =
		game.currentRound && isAlive ? (
			game.gameMode === 'classic' && classicPickData ? (
				<ClassicPick
					gameId={game.id}
					roundId={game.currentRound.id}
					roundName={classicPickData.roundName}
					deadline={classicPickData.deadline}
					fixtures={classicPickData.fixtures}
					usedTeamsByRound={classicPickData.usedTeamsByRound}
					existingPickTeamId={classicPickData.existingPickTeamId}
				/>
			) : game.gameMode === 'turbo' && turboPickData ? (
				<TurboPick
					gameId={game.id}
					roundId={game.currentRound.id}
					roundName={turboPickData.roundName}
					deadline={turboPickData.deadline}
					fixtures={turboPickData.fixtures}
					existingPicks={turboPickData.existingPicks}
					numberOfPicks={numberOfPicks}
				/>
			) : (
				<div className="p-4 rounded-lg border border-border bg-card text-sm text-muted-foreground">
					{game.gameMode[0].toUpperCase() + game.gameMode.slice(1)} pick interface coming soon.
				</div>
			)
		) : (
			<div className="p-4 rounded-lg border border-border bg-card text-sm text-muted-foreground text-center">
				{game.myMembership?.status === 'eliminated'
					? 'You have been eliminated from this game.'
					: game.status === 'completed'
						? 'This game has ended.'
						: 'Waiting for the next round.'}
			</div>
		)

	return (
		<GameDetailView
			game={{
				id: game.id,
				name: game.name,
				gameMode: game.gameMode,
				competition: game.competition.name,
				pot: game.pot,
				entryFee: game.entryFee,
				playerCount: game.players.length,
				aliveCount,
				status: game.status,
				inviteCode: game.inviteCode,
			}}
			pickSection={pickSection}
			classicGrid={classicGrid}
			turboStandings={
				turboStandingsData ? { rounds: turboStandingsData.rounds, numberOfPicks } : null
			}
		/>
	)
}
