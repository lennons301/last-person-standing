import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activeField, isAdminRemoved } from '@/lib/game/elimination'
import { type ModeConfig, resolveModeConfig } from '@/lib/game/mode-config'
import { isRebuyEligible } from '@/lib/game/rebuy'
import { resolveRoundAfterStarting, resolveStartingRound } from '@/lib/game/starting-round'
import { calculatePot, expectedEntryCount, type PotBreakdown } from '@/lib/game-logic/prizes'
import type { PaymentProvider } from '@/lib/payments/payment-link'
import { round } from '@/lib/schema/competition'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'
import type {
	Competition,
	Fixture,
	GameMode,
	GamePlayer,
	GameStatus,
	GameVisibility,
	Pick,
	Round,
	StoredModeConfig,
	Team,
} from '@/lib/types'

/**
 * The game page's own read: the header, the payments panel, the rebuy offer and
 * the pick context the page assembles from them.
 *
 * It loads the whole game graph — every fixture, pick, player, payment and
 * round — which is why it has exactly one production caller. A route that needs
 * only "is this caller allowed to see this game?" reads `requireMembership`
 * (`src/lib/game/membership.ts`) instead (#246).
 */

/** A fixture with both its sides resolved. */
export type GameDetailFixture = Fixture & { homeTeam: Team; awayTeam: Team }

/** The game's current round, with its fixtures in kickoff order. */
export type GameDetailRound = Round & { fixtures: GameDetailFixture[] }

/** A pick with the team it backs and the fixture it sits on. */
export type GameDetailPick = Pick & { team: Team; fixture: GameDetailFixture | null }

/**
 * One row of the admin payments panel. `id` is null and `status` is `'unpaid'`
 * for the synthetic rows standing in for admin-added players who have no
 * payment row at all — that is what keeps the Rebuy button reachable in a
 * free-entry game.
 */
export interface AdminPaymentRow {
	id: string | null
	userId: string
	userName: string
	amount: string
	status: 'pending' | 'claimed' | 'paid' | 'refunded' | 'unpaid'
	isRebuy: boolean
	isRebuyEligible: boolean
	claimedAt: Date | null
	paidAt: Date | null
}

export interface GameDetail {
	id: string
	name: string
	gameMode: GameMode
	/**
	 * The stored settings, carried so the page can put them through
	 * `resolveModeConfig` once for the whole render. Readers take the resolved
	 * {@link ModeConfig}, never this (#248).
	 */
	modeConfig: StoredModeConfig | null
	status: GameStatus
	competition: Competition
	currentRound: GameDetailRound | null
	/**
	 * The round the game was played from — its own round one. The page hands it
	 * to `buildGameView` for the starting-round exemption; `currentRound` can't
	 * answer it once the game has advanced (#203).
	 */
	startingRoundId: string | null
	/**
	 * The starting round row itself, for the non-member view: whether
	 * self-service entry is still open is `evaluateJoinability`'s answer, and it
	 * reads that round's deadline.
	 */
	startingRound: { id: string; deadline: Date | null } | null
	currentRoundId: string | null
	visibility: GameVisibility
	entryFee: string | null
	inviteCode: string
	pot: PotBreakdown
	expectedEntries: number
	players: GamePlayer[]
	picks: GameDetailPick[]
	myMembership: GamePlayer | undefined
	isAdmin: boolean
	isMember: boolean
	creatorName: string
	creatorPaymentProvider: PaymentProvider | null
	creatorPaymentHandle: string | null
	myPayment: {
		id: string
		status: 'pending' | 'claimed' | 'paid' | 'refunded'
		amount: string
	} | null
	/** Only set for the creator — the payments panel is theirs. */
	adminPayments: AdminPaymentRow[] | undefined
	/** The viewer's current-round pick, for the auto-pick banner. */
	myCurrentRoundPick: {
		id: string
		isAuto: boolean
		teamShortName: string
		kickoffLabel: string
	} | null
	rebuyBanner: {
		entryFee: string
		closesAt: Date
		pendingPayment: { id: string; amount: string } | null
	} | null
	defaultShareVariant: 'standings' | 'live' | 'winner'
	liveShareAvailable: boolean
	winnerShareAvailable: boolean
}

export async function getGameDetail(gameId: string, userId: string): Promise<GameDetail | null> {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			competition: true,
			currentRound: {
				with: {
					fixtures: {
						with: { homeTeam: true, awayTeam: true },
						orderBy: (fx, { asc }) => asc(fx.kickoff),
					},
				},
			},
			players: true,
			picks: {
				with: {
					team: true,
					fixture: { with: { homeTeam: true, awayTeam: true } },
				},
			},
		},
	})

	if (!gameData) return null

	// Admin-removed players are fully excluded from the game view — they drop out
	// of standings, counts, the pot target and the payments panel. Their payments
	// were refunded on removal, so the pot total is unaffected.
	const removedUserIds = new Set(gameData.players.filter(isAdminRemoved).map((p) => p.userId))
	gameData.players = activeField(gameData.players)

	const myMembership = gameData.players.find((p) => p.userId === userId)
	const isAdmin = gameData.createdBy === userId
	const isMember = !!myMembership

	// Viewer's current-round pick (used by AutoPickBanner to detect auto-picks).
	let myCurrentRoundPick: GameDetail['myCurrentRoundPick'] = null
	if (myMembership && gameData.currentRoundId) {
		const currentPick = gameData.picks.find(
			(p) => p.gamePlayerId === myMembership.id && p.roundId === gameData.currentRoundId,
		)
		if (currentPick) {
			const kickoff = currentPick.fixture?.kickoff ?? null
			myCurrentRoundPick = {
				id: currentPick.id,
				isAuto: currentPick.isAuto,
				teamShortName: currentPick.team?.shortName ?? '?',
				kickoffLabel: kickoff ? formatKickoff(kickoff) : 'TBC',
			}
		}
	}

	const payments = (
		await db.query.payment.findMany({
			where: eq(payment.gameId, gameId),
		})
	).filter((p) => !removedUserIds.has(p.userId))
	const pot = calculatePot(payments)
	// Target multiplier: counts each player's rebuys as extra owed entries, so the
	// "if everyone paid" target isn't undercounted when players have rebought.
	const expectedEntries = expectedEntryCount(
		gameData.players.map((p) => p.userId),
		payments,
	)

	// Resolve user names for every player + the admin so payment UI can show names.
	const { user } = await import('@/lib/schema/auth')
	const relevantUserIds = Array.from(
		new Set([gameData.createdBy, ...gameData.players.map((p) => p.userId)]),
	)
	const userRows =
		relevantUserIds.length > 0
			? await db
					.select({
						id: user.id,
						name: user.name,
						paymentProvider: user.paymentProvider,
						paymentHandle: user.paymentHandle,
					})
					.from(user)
					.where(inArray(user.id, relevantUserIds))
			: []
	const userNames = new Map(userRows.map((u) => [u.id, u.name]))
	const creatorName = userNames.get(gameData.createdBy) ?? 'the admin'
	// The creator's saved pay-me handle, so the surfaces that show an amount
	// owed can render a pre-filled link. Only reachable by viewers who can
	// already see the game.
	const creatorRow = userRows.find((u) => u.id === gameData.createdBy)

	// Group payments by userId so we can mark duplicates (rebuys) for UI.
	const paymentsByUser = new Map<string, typeof payments>()
	for (const p of payments) {
		const list = paymentsByUser.get(p.userId) ?? []
		list.push(p)
		paymentsByUser.set(p.userId, list)
	}

	// Pre-compute rebuy eligibility per user (used for the admin payments panel).
	// We need the game's own starting round and the round after it — the whole
	// competition sequence is fetched because "the round after" is resolved on it,
	// and the game may have started anywhere in the season (#203). Also reused by
	// the rebuy banner below, so the fetch happens once.
	const competitionRounds = await db.query.round.findMany({
		where: eq(round.competitionId, gameData.competition.id),
	})
	const startingRound = resolveStartingRound(gameData, competitionRounds)
	const roundAfterStarting = resolveRoundAfterStarting(gameData, competitionRounds)
	const modeConfig: ModeConfig = resolveModeConfig(gameData)

	const eligibilityByUser = new Map<string, boolean>()
	for (const uid of relevantUserIds) {
		const userPlayer = gameData.players.find((p) => p.userId === uid)
		const userPaymentRows = payments.filter((p) => p.userId === uid)
		if (!userPlayer || !startingRound || !roundAfterStarting?.deadline) {
			eligibilityByUser.set(uid, false)
			continue
		}
		eligibilityByUser.set(
			uid,
			isRebuyEligible({
				modeConfig,
				gamePlayer: {
					status: userPlayer.status,
					eliminatedRoundId: userPlayer.eliminatedRoundId,
				},
				startingRound: { id: startingRound.id },
				roundAfterStarting: { deadline: roundAfterStarting.deadline },
				paymentRowCount: userPaymentRows.length,
				now: new Date(),
			}),
		)
	}

	// Viewer's primary (earliest) payment row — the one the claim endpoint targets.
	const myPaymentRows = [...(paymentsByUser.get(userId) ?? [])].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	)
	const myPayment = myPaymentRows[0]
		? {
				id: myPaymentRows[0].id,
				status: myPaymentRows[0].status as 'pending' | 'claimed' | 'paid' | 'refunded',
				amount: myPaymentRows[0].amount,
			}
		: null

	// Full list of payments (one row per payment record) with user name + isRebuy
	// flag. Feeds the admin payments panel (finalAdminPayments) below.
	const allPayments = Array.from(paymentsByUser.entries()).flatMap(([uid, rows]) => {
		const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
		return sorted.map((row, idx) => ({
			id: row.id,
			userId: uid,
			userName: userNames.get(uid) ?? 'Player',
			amount: row.amount,
			status: row.status as 'pending' | 'claimed' | 'paid' | 'refunded',
			isRebuy: idx > 0,
			isRebuyEligible: idx === 0 ? (eligibilityByUser.get(uid) ?? false) : false,
			claimedAt: row.claimedAt,
			paidAt: row.paidAt,
		}))
	})

	// Surface admin-added players who have no payment row as synthetic "unpaid" rows
	// so the admin Rebuy button is reachable for free-entry players.
	const playersWithPayments = new Set(allPayments.map((p) => p.userId))
	const syntheticUnpaidRows = gameData.players
		.filter((p) => !playersWithPayments.has(p.userId))
		.map((p) => ({
			id: null,
			userId: p.userId,
			userName: userNames.get(p.userId) ?? 'Unknown',
			amount: gameData.entryFee ?? '0.00',
			status: 'unpaid' as const,
			isRebuy: false,
			isRebuyEligible: eligibilityByUser.get(p.userId) ?? false,
			claimedAt: null,
			paidAt: null,
		}))
	// finalAdminPayments unions real payment rows with synthetic free-player rows.
	// The id field is widened to string | null for synthetic rows.
	const finalAdminPayments: AdminPaymentRow[] = [...allPayments, ...syntheticUnpaidRows]

	const adminPayments = isAdmin ? finalAdminPayments : undefined

	// Rebuy banner: the starting round and the one after it were already resolved
	// above for the eligibility checks.
	const viewerGamePlayer = myMembership
	const viewerPayments = [...(paymentsByUser.get(userId) ?? [])]

	let rebuyBanner: GameDetail['rebuyBanner'] = null

	if (viewerGamePlayer && startingRound && roundAfterStarting?.deadline && gameData.entryFee) {
		const eligible = isRebuyEligible({
			modeConfig,
			gamePlayer: {
				status: viewerGamePlayer.status,
				eliminatedRoundId: viewerGamePlayer.eliminatedRoundId,
			},
			startingRound: { id: startingRound.id },
			roundAfterStarting: { deadline: roundAfterStarting.deadline },
			paymentRowCount: viewerPayments.length,
			now: new Date(),
		})

		// Pending-rebuy state: viewer has more than one payment row, the most recent is
		// pending, and they're alive (i.e., they already initiated a rebuy and need to
		// claim paid).
		const sortedPayments = [...viewerPayments].sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
		)
		const mostRecent = sortedPayments[0]
		const hasPendingRebuy =
			viewerPayments.length > 1 &&
			mostRecent?.status === 'pending' &&
			viewerGamePlayer.status === 'alive'

		if (eligible) {
			rebuyBanner = {
				entryFee: gameData.entryFee,
				closesAt: roundAfterStarting.deadline,
				pendingPayment: null,
			}
		} else if (hasPendingRebuy && mostRecent) {
			rebuyBanner = {
				entryFee: gameData.entryFee,
				closesAt: roundAfterStarting.deadline,
				pendingPayment: { id: mostRecent.id, amount: mostRecent.amount },
			}
		}
	}

	// Determine the default share variant and which variants are available.
	let defaultShareVariant: GameDetail['defaultShareVariant'] = 'standings'
	let liveShareAvailable = false
	let winnerShareAvailable = false

	if (gameData.status === 'completed') {
		defaultShareVariant = 'winner'
		winnerShareAvailable = true
	} else {
		const currentRound = gameData.currentRound
		if (currentRound?.status === 'active') {
			const liveFixture = currentRound.fixtures?.find((f) => f.status === 'live')
			if (liveFixture) {
				defaultShareVariant = 'live'
				liveShareAvailable = true
			}
		}
	}

	return {
		id: gameData.id,
		name: gameData.name,
		gameMode: gameData.gameMode,
		modeConfig: gameData.modeConfig,
		status: gameData.status,
		competition: gameData.competition,
		currentRound: gameData.currentRound,
		startingRoundId: gameData.startingRoundId,
		startingRound: startingRound
			? { id: startingRound.id, deadline: startingRound.deadline }
			: null,
		currentRoundId: gameData.currentRoundId,
		visibility: gameData.visibility,
		entryFee: gameData.entryFee,
		inviteCode: gameData.inviteCode,
		pot,
		expectedEntries,
		players: gameData.players,
		picks: gameData.picks,
		myMembership,
		isAdmin,
		isMember,
		creatorName,
		creatorPaymentProvider: creatorRow?.paymentProvider ?? null,
		creatorPaymentHandle: creatorRow?.paymentHandle ?? null,
		myPayment,
		adminPayments,
		myCurrentRoundPick,
		rebuyBanner,
		defaultShareVariant,
		liveShareAvailable,
		winnerShareAvailable,
	}
}

/**
 * Server-side label used only for places where a React component can't run
 * (currently just the AutoPickBanner kickoff line above). All other surfaces
 * render via <LocalDateTime /> in the user's timezone.
 */
function formatKickoff(date: Date): string {
	const day = date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/London' })
	const dayOfMonth = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		timeZone: 'Europe/London',
	}).format(date)
	const month = date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'Europe/London' })
	const time = date.toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Europe/London',
	})
	return `${day} ${dayOfMonth} ${month} · ${time}`
}
