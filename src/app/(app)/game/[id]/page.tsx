import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { ActingAsBanner } from '@/components/game/acting-as-banner'
import { GameDetailView } from '@/components/game/game-detail-view'
import { RebuyBanner } from '@/components/game/rebuy-banner'
import { ClassicPick } from '@/components/picks/classic-pick'
import type { CupPickFixture, CupPickSlot } from '@/components/picks/cup-pick'
import { CupPickForm } from '@/components/picks/cup-pick-form'
import { TurboPick } from '@/components/picks/turbo-pick'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
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
import { user } from '@/lib/schema/auth'
import { gamePlayer } from '@/lib/schema/game'

function initialsFromName(name: string): string {
	return (
		name
			.split(' ')
			.map((p) => p[0] ?? '')
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase() || '??'
	)
}

export default async function GameDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>
	searchParams: Promise<{ actingAs?: string }>
}) {
	const session = await requireSession()
	const { id } = await params
	const resolvedSearchParams = await searchParams
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

	// Resolve actingAs: admin-only override of whose pick context we render.
	// Runs before any pick-data loading so non-admins can't leak target picks.
	const actingAsId = resolvedSearchParams.actingAs ?? null
	let actingAsTarget: {
		gamePlayerId: string
		userName: string
		initials: string
		livesRemaining: number
	} | null = null

	if (actingAsId) {
		if (!game.isAdmin) {
			// Non-admin attempting to use actingAs — strip the param and redirect.
			redirect(`/game/${id}`)
		}
		const [targetRow] = await db
			.select({
				gamePlayerId: gamePlayer.id,
				userName: user.name,
				livesRemaining: gamePlayer.livesRemaining,
			})
			.from(gamePlayer)
			.innerJoin(user, eq(user.id, gamePlayer.userId))
			.where(and(eq(gamePlayer.id, actingAsId), eq(gamePlayer.gameId, game.id)))
			.limit(1)
		if (!targetRow) {
			// Invalid actingAs target — redirect back to the game page.
			redirect(`/game/${id}`)
		}
		actingAsTarget = {
			gamePlayerId: targetRow.gamePlayerId,
			userName: targetRow.userName,
			initials: initialsFromName(targetRow.userName),
			livesRemaining: targetRow.livesRemaining,
		}
	}

	// Choose the gamePlayer whose pick context we're loading. Admin acting-as mode
	// targets another player; otherwise the viewer's own membership.
	const targetGamePlayerId = actingAsTarget?.gamePlayerId ?? game.myMembership?.id
	const targetLivesRemaining =
		actingAsTarget?.livesRemaining ?? game.myMembership?.livesRemaining ?? 0

	const classicPickData =
		game.currentRound && targetGamePlayerId && game.gameMode === 'classic'
			? await getClassicPickData(game.id, game.currentRound.id, targetGamePlayerId)
			: null

	const classicPlannerData =
		targetGamePlayerId && game.gameMode === 'classic'
			? await getClassicPlannerData(game.id, targetGamePlayerId, game.currentRound?.id ?? null)
			: null

	const turboPickData =
		game.currentRound && targetGamePlayerId && game.gameMode === 'turbo'
			? await getTurboPickData(game.id, game.currentRound.id, targetGamePlayerId)
			: null

	const numberOfPicks = game.modeConfig?.numberOfPicks ?? 10
	const startingLives = game.modeConfig?.startingLives ?? 3

	const classicGrid =
		game.gameMode === 'classic' ? await getProgressGridData(game.id, session.user.id) : null
	const turboStandingsData =
		game.gameMode === 'turbo' ? await getTurboStandingsData(game.id, session.user.id) : null
	const cupStandingsData =
		game.gameMode === 'cup' ? await getCupLadderData(game.id, session.user.id) : null

	// Alive check is on the TARGET player (acting-as) or the viewer's own membership.
	const targetPlayerStatus = actingAsTarget
		? game.players.find((p) => p.id === actingAsTarget.gamePlayerId)?.status
		: game.myMembership?.status
	const isAlive = targetPlayerStatus === 'alive' || !!actingAsTarget
	// NB: in acting-as mode we always render the pick UI even for "eliminated"
	// players so admins can rebuy-via-pick (see maybeUnEliminate in the POST route).
	const aliveCount = game.players.filter((p) => p.status === 'alive').length

	// Target = entryFee × playerCount (what the pot would be if everyone paid).
	// Unpaid = headline sum of outstanding (not yet claimed) entries, computed
	// directly from target − pot.total since pot includes both paid and claimed.
	const entryFeeNum = game.entryFee ? Number.parseFloat(game.entryFee) : 0
	const targetNum = entryFeeNum * game.players.length
	const unpaidNum = Math.max(0, targetNum - Number.parseFloat(game.pot.total))
	const target = targetNum.toFixed(2)
	const unpaid = unpaidNum.toFixed(2)

	// Build cup pick props. Source picks from the TARGET player so admin acting-as
	// sees the target's existing slot state, not their own.
	let cupFixtures: CupPickFixture[] = []
	let cupInitialSlots: CupPickSlot[] = []
	if (game.gameMode === 'cup' && game.currentRound && targetGamePlayerId) {
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

		cupInitialSlots = game.picks
			.filter(
				(p) =>
					p.gamePlayerId === targetGamePlayerId &&
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

	const actingAsForPickUI = actingAsTarget
		? { gamePlayerId: actingAsTarget.gamePlayerId, userName: actingAsTarget.userName }
		: undefined

	// Once a round's deadline has passed (and processGameRound has not yet
	// advanced the game's currentRoundId), the pick interface is locked: showing
	// it would just surface options the user can no longer use. We render a
	// concise "Round closed" panel instead. Standings views (rendered below the
	// pickSection) are where the user gets the live/results detail.
	const now = new Date()
	const roundDeadlinePassed = !!game.currentRound?.deadline && now >= game.currentRound.deadline

	const pickSection =
		game.currentRound && isAlive && !roundDeadlinePassed ? (
			game.gameMode === 'classic' && classicPickData ? (
				<ClassicPick
					gameId={game.id}
					roundId={game.currentRound.id}
					roundName={classicPickData.roundName}
					roundNumber={classicPickData.roundNumber}
					competitionId={classicPickData.competitionId}
					deadline={classicPickData.deadline}
					fixtures={classicPickData.fixtures}
					usedTeamsByRound={classicPickData.usedTeamsByRound}
					existingPickTeamId={classicPickData.existingPickTeamId}
					chain={classicPlannerData?.chain}
					futureRounds={classicPlannerData?.futureRounds}
					actingAs={actingAsForPickUI}
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
					actingAs={actingAsForPickUI}
				/>
			) : game.gameMode === 'cup' && targetGamePlayerId ? (
				<CupPickForm
					gameId={game.id}
					roundId={game.currentRound.id}
					fixtures={cupFixtures}
					numberOfPicks={numberOfPicks}
					livesRemaining={targetLivesRemaining}
					maxLives={startingLives}
					initialSlots={cupInitialSlots}
					deadline={game.currentRound.deadline}
					readonly={game.status !== 'open'}
					actingAs={actingAsForPickUI}
					competitionId={game.competition.id}
					roundNumber={game.currentRound.number}
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
						: roundDeadlinePassed
							? 'Round closed — picks locked. Live scores and standings update below.'
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
				defaultShareVariant: game.defaultShareVariant,
				liveShareAvailable: game.liveShareAvailable,
				winnerShareAvailable: game.winnerShareAvailable,
			}}
			pickSection={
				<>
					{game.rebuyBanner && (
						<RebuyBanner
							gameId={game.id}
							entryFee={game.rebuyBanner.entryFee}
							round2Deadline={game.rebuyBanner.round2Deadline}
							pendingPayment={game.rebuyBanner.pendingPayment}
						/>
					)}
					{actingAsTarget && (
						<ActingAsBanner
							gameId={game.id}
							targetUserName={actingAsTarget.userName}
							targetAvatarInitials={actingAsTarget.initials}
						/>
					)}
					{pickSection}
				</>
			}
			classicGrid={classicGrid}
			turboStandings={
				turboStandingsData ? { rounds: turboStandingsData.rounds, numberOfPicks } : null
			}
			cupStandings={cupStandingsData}
		/>
	)
}
