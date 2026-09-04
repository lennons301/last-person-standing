import { and, asc, eq, gt } from 'drizzle-orm'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ActingAsBanner } from '@/components/game/acting-as-banner'
import { GameDetailView } from '@/components/game/game-detail-view'
import { ClassicPick } from '@/components/picks/classic-pick'
import type { CupPickFixture, CupPickSlot } from '@/components/picks/cup-pick'
import { CupPickForm } from '@/components/picks/cup-pick-form'
import { TurboPick } from '@/components/picks/turbo-pick'
import { Button } from '@/components/ui/button'
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
import { buildGameView, type GameViewPickInput } from '@/lib/game/game-view'
import { evaluateJoinability, JOIN_BLOCKED_COPY } from '@/lib/game/joinability'
import { resolveModeConfig } from '@/lib/game/mode-config'
import { reconcileGameState } from '@/lib/game/reconcile'
import { roundLabel, roundLabelLong } from '@/lib/game/round-label'
import { getRoundSummary } from '@/lib/game/round-summary-query'
import { formatRoundSummaryText } from '@/lib/game/round-summary-text'
import { buildWinnerBanner } from '@/lib/game/winner-banner-builder'
import { computeTierDifference } from '@/lib/game-logic/cup-tier'
import { buildPaymentLink, buildPaymentReference } from '@/lib/payments/payment-link'
import { user } from '@/lib/schema/auth'
import { round as roundTable } from '@/lib/schema/competition'
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

	// Self-healing safety-net: every viewer triggers a reconcile pass.
	// Per-fixture settlement (lib/game/settle.ts) is the primary path; this
	// catches anything the inline settle missed. Idempotent.
	await reconcileGameState(id)

	const game = await getGameDetail(id, session.user.id)
	if (!game) notFound()

	if (!game.isMember) {
		// Somebody who found this game in the home page's discovery sections, or
		// followed a link to it. What they need is why they can't play and what to
		// do about it — the same rule and the same words the join route and the
		// invite page use, so no surface can drift from another.
		const { reason } = evaluateJoinability({
			game: {
				status: game.status,
				currentRoundId: game.currentRoundId,
				startingRoundId: game.startingRoundId,
			},
			startingRound: game.startingRound,
			now: new Date(),
		})
		const blocked = reason ? JOIN_BLOCKED_COPY[reason] : null

		return (
			<div className="max-w-md mx-auto text-center py-12">
				<h1 className="font-display text-xl font-semibold">{game.name}</h1>
				{blocked ? (
					<>
						<p className="font-medium mt-3">{blocked.heading}</p>
						<p className="text-sm text-muted-foreground mt-1">{blocked.message}</p>
					</>
				) : game.visibility === 'public' ? (
					// Open for entry and public — the invite code is a second way in to a
					// game anyone can already find, so it's no secret here.
					<>
						<p className="text-muted-foreground mt-3">
							You&apos;re not in this game yet — it&apos;s open to join.
						</p>
						<Button asChild className="mt-4" size="lg">
							<Link href={`/join/${game.inviteCode}`}>Join game</Link>
						</Button>
					</>
				) : (
					// Private and still open: the invite link is the only way in, and it
					// isn't ours to hand out.
					<p className="text-muted-foreground mt-2">You&apos;re not a member of this game.</p>
				)}
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

	// One read of the game's settings for the whole page — the defaults live in
	// `resolveModeConfig`, not here (#248). Classic needs exactly one pick and
	// has no lives, which is what the two ternaries say.
	const modeConfig = resolveModeConfig(game)
	const numberOfPicks = modeConfig.mode === 'classic' ? 1 : modeConfig.numberOfPicks
	const startingLives = modeConfig.mode === 'cup' ? modeConfig.startingLives : 0
	const allowRebuys = modeConfig.mode === 'classic' && modeConfig.allowRebuys

	const classicGrid =
		game.gameMode === 'classic' ? await getProgressGridData(game.id, session.user.id) : null
	// The post-deadline round summary: one derivation feeding the card under the
	// progress grid and the prose in the share dialog. Classic only, and null
	// until one of this game's own deadlines has passed — the query decides both.
	const roundSummaryView = game.gameMode === 'classic' ? await getRoundSummary(game.id) : null
	const roundSummary = roundSummaryView
		? { view: roundSummaryView, text: formatRoundSummaryText(roundSummaryView) }
		: null

	const turboStandingsData =
		game.gameMode === 'turbo' ? await getTurboStandingsData(game.id, session.user.id) : null
	const cupStandingsData =
		game.gameMode === 'cup' ? await getCupLadderData(game.id, session.user.id) : null

	// Winner banner: rendered above standings on completed games. Built by a pure
	// function so its output can be unit-tested for JSON-serializability — the
	// prop crosses the Server → Client Component boundary, and a function ref
	// here crashes the whole page render (PR #55 → #57 incident).
	const winnerBanner = buildWinnerBanner({
		gameMode: game.gameMode as 'classic' | 'turbo' | 'cup',
		gameStatus: game.status,
		potTotal: game.pot.total,
		players: game.players,
		turboStandings: turboStandingsData,
		cupStandings: cupStandingsData,
		classicGrid,
	})

	// Alive check is on the TARGET player (acting-as) or the viewer's own membership.
	const targetPlayerStatus = actingAsTarget
		? game.players.find((p) => p.id === actingAsTarget.gamePlayerId)?.status
		: game.myMembership?.status
	const isAlive = targetPlayerStatus === 'alive' || !!actingAsTarget
	// NB: in acting-as mode we always render the pick UI even for "eliminated"
	// players so admins can rebuy-via-pick (see maybeUnEliminate in the POST route).
	const aliveCount = game.players.filter((p) => p.status === 'alive').length

	// Target = entryFee × expected entries (what the pot would be if everyone
	// paid). expectedEntries counts each player's rebuys as additional owed
	// entries, so a rebuy isn't missed (was players.length, which under-counted).
	// Unpaid = headline sum of outstanding entries, computed directly from
	// target − pot.total.
	const entryFeeNum = game.entryFee ? Number.parseFloat(game.entryFee) : 0
	const targetNum = entryFeeNum * game.expectedEntries
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

	const competitionType = game.competition.type as 'league' | 'knockout' | 'group_knockout'
	const headerRoundInfo = game.currentRound
		? {
				label: roundLabel(competitionType, game.currentRound.number),
				longLabel: roundLabelLong(competitionType, game.currentRound.number),
				deadline: game.currentRound.deadline,
				deadlinePassed: roundDeadlinePassed,
				roundCompleted: game.currentRound.status === 'completed',
			}
		: null

	// Current-round picks for whoever's context we're rendering (viewer, or the
	// acting-as target). Feeds the hero's pick state: how many slots are filled,
	// whether any was auto-submitted, and — classic only — the team confirmation.
	const heroRound = game.currentRound
	const targetCurrentPicks =
		heroRound && targetGamePlayerId
			? game.picks.filter(
					(p) => p.gamePlayerId === targetGamePlayerId && p.roundId === heroRound.id,
				)
			: []

	let heroPick: GameViewPickInput | null = null
	if (targetCurrentPicks.length > 0) {
		const teamPick = game.gameMode === 'classic' ? targetCurrentPicks[0] : null
		const teamFixture = teamPick?.fixture ?? null
		const pickedHome = teamFixture ? teamFixture.homeTeamId === teamPick?.teamId : false
		heroPick = {
			picksMade: targetCurrentPicks.length,
			isAuto: targetCurrentPicks.some((p) => p.isAuto),
			team: teamPick?.team
				? {
						shortName: teamPick.team.shortName,
						name: teamPick.team.name,
						opponentName: teamFixture
							? pickedHome
								? teamFixture.awayTeam.name
								: teamFixture.homeTeam.name
							: null,
						side: teamFixture ? (pickedHome ? 'home' : 'away') : null,
						kickoffIso: teamFixture?.kickoff ? teamFixture.kickoff.toISOString() : null,
					}
				: null,
			// The scoreboard the hero's post-deadline live read runs off. The
			// current scores come straight from the fixture row the poller writes;
			// the client-side live ticker above the hero keeps the fuller picture.
			fixture: teamFixture
				? {
						id: teamFixture.id,
						status: teamFixture.status,
						homeShort: teamFixture.homeTeam.shortName,
						awayShort: teamFixture.awayTeam.shortName,
						homeScore: teamFixture.homeScore,
						awayScore: teamFixture.awayScore,
						kickoffIso: teamFixture.kickoff ? teamFixture.kickoff.toISOString() : null,
					}
				: null,
			results: targetCurrentPicks.map((p) => p.result),
		}
	}

	// The round the game moves to next — the round-result hero points at it. Only
	// needed once the current round has been settled, and only in classic: turbo
	// and cup are single-round, so they never advance to an N+1. Queried the same
	// way `advanceGame` picks its target (lowest number above this one,
	// not number + 1) so the hero can't disagree with the engine on a competition
	// whose round numbers aren't contiguous.
	const nextRoundRow =
		game.gameMode === 'classic' && heroRound?.status === 'completed'
			? ((await db.query.round.findFirst({
					where: and(
						eq(roundTable.competitionId, game.competition.id),
						gt(roundTable.number, heroRound.number),
					),
					orderBy: [asc(roundTable.number)],
				})) ?? null)
			: null

	// The round the target player went out in — the quiet note on the rebuy and
	// spectator heroes.
	const targetPlayer = actingAsTarget
		? game.players.find((p) => p.id === actingAsTarget.gamePlayerId)
		: game.myMembership
	const eliminatedRoundRow = targetPlayer?.eliminatedRoundId
		? ((await db.query.round.findFirst({
				where: eq(roundTable.id, targetPlayer.eliminatedRoundId),
			})) ?? null)
		: null

	// Pure deriver — everything the top-of-page hero branches on, plus the flags
	// that tell the old header which bands the hero has taken over. Takes `now`
	// as an argument so it stays unit-testable.
	const gameView = buildGameView({
		gameMode: game.gameMode as 'classic' | 'turbo' | 'cup',
		gameStatus: game.status,
		round: heroRound
			? {
					id: heroRound.id,
					number: heroRound.number,
					status: heroRound.status,
					deadline: heroRound.deadline,
					label: roundLabel(competitionType, heroRound.number),
					longLabel: roundLabelLong(competitionType, heroRound.number),
				}
			: null,
		game: {
			currentRoundId: heroRound?.id ?? null,
			currentRoundNumber: heroRound?.number ?? null,
			// The game's own round one, for the starting-round exemption. Note the
			// two above are the *hero's* round, which is the game's current round or
			// the one the viewer is looking at — neither remembers where the game
			// began (#203).
			startingRoundId: game.startingRoundId,
		},
		isAlive,
		// `isAlive` is forced true for an acting-as target so the admin gets the
		// pick hero; the hero still has to know they're actually out.
		targetEliminated: targetPlayerStatus === 'eliminated',
		actingAsName: actingAsTarget?.userName ?? null,
		pick: heroPick,
		picksRequired: numberOfPicks,
		rebuyAvailable: !!game.rebuyBanner,
		livesRemaining: targetLivesRemaining,
		nextRound: nextRoundRow
			? {
					number: nextRoundRow.number,
					label: roundLabel(competitionType, nextRoundRow.number),
					longLabel: roundLabelLong(competitionType, nextRoundRow.number),
					deadline: nextRoundRow.deadline,
				}
			: null,
		rebuy: game.rebuyBanner
			? {
					entryFee: game.rebuyBanner.entryFee,
					closesAt: game.rebuyBanner.closesAt,
					pendingPayment: game.rebuyBanner.pendingPayment,
				}
			: null,
		eliminatedRoundLabel: eliminatedRoundRow
			? roundLabel(competitionType, eliminatedRoundRow.number)
			: null,
		eliminatedRoundId: targetPlayer?.eliminatedRoundId ?? null,
		allowRebuys,
		winner: winnerBanner,
		viewerUserId: session.user.id,
		pot: {
			confirmed: game.pot.confirmed,
			pending: game.pot.pending,
			total: game.pot.total,
			unpaid,
			target,
		},
		aliveCount,
		playerCount: game.players.length,
		now,
	})

	// The stand-in for a player with no pick interface to show. Suppressed once a
	// hero owns the state: "You have been eliminated from this game." under the
	// spectator hero, or "Round closed — picks locked" under the live one, is the
	// same duplication the standalone rebuy and winner bands were.
	const pickPlaceholder = gameView.demote.pickPlaceholder ? null : (
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

	const pickSection =
		game.currentRound && isAlive && game.gameMode === 'classic' && classicPickData ? (
			// Classic stays interactive even after the current deadline passes: the
			// current round locks (read-only) but the player can still lock in real
			// picks for upcoming rounds.
			<ClassicPick
				gameId={game.id}
				roundId={game.currentRound.id}
				roundName={classicPickData.roundName}
				roundNumber={classicPickData.roundNumber}
				competitionId={classicPickData.competitionId}
				// League → the picker opens on the Table view; knockout → on the
				// fixtures. Either way the toggle is there when standings exist.
				competitionType={classicPickData.competitionType}
				deadline={classicPickData.deadline}
				fixtures={classicPickData.fixtures}
				usedTeamsByRound={classicPickData.usedTeamsByRound}
				existingPickTeamId={classicPickData.existingPickTeamId}
				existingPickFixtureId={classicPickData.existingPickFixtureId}
				chain={classicPlannerData?.chain}
				futureRounds={classicPlannerData?.futureRounds}
				// An admin acting-as a player can fix a pick after the deadline, so the
				// current round stays interactive for them; for everyone else it locks.
				currentRoundClosed={roundDeadlinePassed && !actingAsTarget}
				actingAs={actingAsForPickUI}
				// Every hero variant that already carries the locked-in pick — before
				// the deadline and after it.
				summaryInHero={
					gameView.hero.kind === 'pick-made' ||
					gameView.hero.kind === 'live' ||
					gameView.hero.kind === 'round-result'
				}
			/>
		) : game.currentRound && isAlive && (!roundDeadlinePassed || !!actingAsTarget) ? (
			game.gameMode === 'turbo' && turboPickData ? (
				<TurboPick
					gameId={game.id}
					roundId={game.currentRound.id}
					roundNumber={turboPickData.roundNumber}
					competitionId={turboPickData.competitionId}
					// League → the remaining fixtures open as the Table view; anything
					// else → as fixture rows. The toggle is there when standings exist.
					competitionType={turboPickData.competitionType}
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
					readonly={game.status === 'completed'}
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
			pickPlaceholder
		)

	// Pre-filled pay links for whatever this viewer owes. Derived server-side and
	// handed down as plain strings. Suppressed for the creator themselves — a
	// link to your own account is noise, and they still have "Mark as paid".
	const payReference = buildPaymentReference(game.name, session.user.name)
	const payLinkFor = (amount: string | null | undefined) =>
		game.isAdmin
			? null
			: buildPaymentLink({
					provider: game.creatorPaymentProvider,
					handle: game.creatorPaymentHandle,
					amount,
					reference: payReference,
				})

	return (
		<GameDetailView
			game={{
				id: game.id,
				name: game.name,
				gameMode: game.gameMode,
				competition: game.competition.name,
				pot: game.pot,
				entryFee: game.entryFee,
				allowRebuys,
				aliveCount,
				status: game.status,
				inviteCode: game.inviteCode,
				creatorName: game.creatorName,
				isAdmin: game.isAdmin,
				myPayment: game.myPayment,
				myPaymentPayUrl: payLinkFor(game.myPayment?.amount),
				creatorPaymentProvider: game.creatorPaymentProvider,
				creatorPaymentHandle: game.creatorPaymentHandle,
				adminPayments: game.adminPayments,
				myCurrentRoundPick: game.myCurrentRoundPick,
				currentRound: headerRoundInfo,
				defaultShareVariant: game.defaultShareVariant,
				liveShareAvailable: game.liveShareAvailable,
				winnerShareAvailable: game.winnerShareAvailable,
			}}
			view={gameView}
			pickSection={
				<>
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
			rebuy={
				game.rebuyBanner
					? {
							entryFee: game.rebuyBanner.entryFee,
							closesAt: game.rebuyBanner.closesAt,
							pendingPayment: game.rebuyBanner.pendingPayment,
							creatorName: game.creatorName,
							payUrl: payLinkFor(game.rebuyBanner.pendingPayment?.amount),
						}
					: null
			}
			cupStandings={cupStandingsData}
			roundSummary={roundSummary}
		/>
	)
}
