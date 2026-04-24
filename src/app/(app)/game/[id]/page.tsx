import { notFound } from 'next/navigation'
import { GameDetailView } from '@/components/game/game-detail-view'
import { ClassicPick } from '@/components/picks/classic-pick'
import type { CupPickFixture, CupPickSlot } from '@/components/picks/cup-pick'
import { CupPickForm } from '@/components/picks/cup-pick-form'
import { TurboPick } from '@/components/picks/turbo-pick'
import { requireSession } from '@/lib/auth-helpers'
import { getCupLadderData } from '@/lib/game/cup-standings-queries'
import {
	getClassicPickData,
	getClassicPlannerData,
	getGameDetail,
	getProgressGridData,
	getTurboPickData,
	getTurboStandingsData,
} from '@/lib/game/detail-queries'
import { computeTierDifference } from '@/lib/game-logic/cup-tier'

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

	const classicPlannerData =
		game.myMembership && game.gameMode === 'classic'
			? await getClassicPlannerData(game.id, game.myMembership.id, game.currentRound?.id ?? null)
			: null

	const turboPickData =
		game.currentRound && game.myMembership && game.gameMode === 'turbo'
			? await getTurboPickData(game.id, game.currentRound.id, game.myMembership.id)
			: null

	const numberOfPicks = game.modeConfig?.numberOfPicks ?? 10
	const startingLives = game.modeConfig?.startingLives ?? 3

	const classicGrid =
		game.gameMode === 'classic' ? await getProgressGridData(game.id, session.user.id) : null
	const turboStandingsData =
		game.gameMode === 'turbo' ? await getTurboStandingsData(game.id, session.user.id) : null
	const cupStandingsData =
		game.gameMode === 'cup' ? await getCupLadderData(game.id, session.user.id) : null

	const isAlive = game.myMembership?.status === 'alive'
	const aliveCount = game.players.filter((p) => p.status === 'alive').length

	// Target = entryFee × playerCount (what the pot would be if everyone paid).
	// Unpaid = headline sum of outstanding (not yet claimed) entries, computed
	// directly from target − pot.total since pot includes both paid and claimed.
	const entryFeeNum = game.entryFee ? Number.parseFloat(game.entryFee) : 0
	const targetNum = entryFeeNum * game.players.length
	const unpaidNum = Math.max(0, targetNum - Number.parseFloat(game.pot.total))
	const target = targetNum.toFixed(2)
	const unpaid = unpaidNum.toFixed(2)

	// Build cup pick props inline from the data already fetched by getGameDetail.
	// (Kept here rather than in detail-queries.ts because all source fields are already loaded.)
	let cupFixtures: CupPickFixture[] = []
	let cupInitialSlots: CupPickSlot[] = []
	if (game.gameMode === 'cup' && game.currentRound && game.myMembership) {
		cupFixtures = game.currentRound.fixtures.map((f) => ({
			id: f.id,
			homeTeamId: f.homeTeamId,
			awayTeamId: f.awayTeamId,
			homeShort: f.homeTeam.shortName,
			homeName: f.homeTeam.name,
			homeColor: f.homeTeam.primaryColor,
			homeBadgeUrl: f.homeTeam.badgeUrl,
			awayShort: f.awayTeam.shortName,
			awayName: f.awayTeam.name,
			awayColor: f.awayTeam.primaryColor,
			awayBadgeUrl: f.awayTeam.badgeUrl,
			kickoff: f.kickoff,
			tierDifference: computeTierDifference(f.homeTeam, f.awayTeam, game.competition.type),
		}))

		const myPlayerId = game.myMembership.id
		cupInitialSlots = game.picks
			.filter(
				(p) =>
					p.gamePlayerId === myPlayerId &&
					p.roundId === game.currentRound?.id &&
					p.fixtureId != null &&
					p.confidenceRank != null,
			)
			.map((p) => ({
				confidenceRank: p.confidenceRank as number,
				fixtureId: p.fixtureId as string,
				pickedSide: (p.predictedResult === 'away_win' ? 'away' : 'home') as 'home' | 'away',
			}))
	}

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
					chain={classicPlannerData?.chain}
					futureRounds={classicPlannerData?.futureRounds}
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
			) : game.gameMode === 'cup' && game.myMembership ? (
				<CupPickForm
					gameId={game.id}
					roundId={game.currentRound.id}
					fixtures={cupFixtures}
					numberOfPicks={numberOfPicks}
					livesRemaining={game.myMembership.livesRemaining}
					maxLives={startingLives}
					initialSlots={cupInitialSlots}
					deadline={game.currentRound.deadline}
					readonly={game.status !== 'open'}
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
				target,
				unpaid,
				entryFee: game.entryFee,
				playerCount: game.players.length,
				aliveCount,
				status: game.status,
				inviteCode: game.inviteCode,
				creatorName: game.creatorName,
				isAdmin: game.isAdmin,
				myPayment: game.myPayment,
				otherPayments: game.otherPayments,
				adminPayments: game.adminPayments,
				myCurrentRoundPick: game.myCurrentRoundPick,
			}}
			pickSection={pickSection}
			classicGrid={classicGrid}
			turboStandings={
				turboStandingsData ? { rounds: turboStandingsData.rounds, numberOfPicks } : null
			}
			cupStandings={cupStandingsData}
		/>
	)
}
