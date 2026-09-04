import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
	isKnockoutRound,
	resolveClassicPickResult,
	settleClassicPick,
} from '@/lib/game/classic-survival'
import { type ModeConfig, resolveModeConfig } from '@/lib/game/mode-config'
import { resolvePickVisibility } from '@/lib/game/pick-visibility'
import type { PicksLockedRound } from '@/lib/game/round-status'
import { evaluateCupPicks, resolveCupQualifier } from '@/lib/game-logic/cup'
import { computeTierDifference } from '@/lib/game-logic/cup-tier'
import { type PreMatchFixtureRow, preMatchWinProbability } from '@/lib/live/pre-match'
import type { LivePayload, LivePick, LivePlayer } from '@/lib/live/types'
import { game, type gamePlayer, pick } from '@/lib/schema/game'

/**
 * The live poll's payload — the one read behind `/api/games/[id]/live` and the
 * pop-out it drives.
 *
 * It declares `LivePayload` (`src/lib/live/types.ts`) rather than leaving the
 * shape inferred: the browser only ever *asserted* that type on the JSON it
 * received, so a required field the server quietly stopped sending (or sent
 * with a wider value than the type admits) went unnoticed (#249).
 */
export async function getLivePayload(
	gameId: string,
	viewerUserId: string,
): Promise<LivePayload | null> {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			competition: true,
			currentRound: {
				with: {
					fixtures: {
						// `odds` is the market the daily sync already persisted, frozen at
						// the round's deadline — the pre-match chance each pick went in at
						// (#222). A join, not a provider call: the live view makes none.
						with: { homeTeam: true, awayTeam: true, odds: true },
						orderBy: (fx, { asc }) => asc(fx.kickoff),
					},
				},
			},
			players: true,
		},
	})
	if (!gameData) return null

	const picksInRound = gameData.currentRoundId
		? await db.query.pick.findMany({
				where: and(eq(pick.gameId, gameId), eq(pick.roundId, gameData.currentRoundId)),
			})
		: []

	const fixturesRaw = gameData.currentRound?.fixtures ?? []
	// Where a pick's pre-match win chance comes from — the picked team's own end
	// of the persisted market, resolved by `preMatchWinProbability`.
	const oddsByFixture = new Map<string, PreMatchFixtureRow>(
		fixturesRaw.map((f) => [
			f.id,
			{ homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, odds: f.odds },
		]),
	)
	// Whether this round's fixtures are knockout ties — matches that can't end
	// level, so an unresolved one is deferred rather than shown settled (#107).
	const roundIsKnockout = isKnockoutRound(
		gameData.competition.type,
		gameData.currentRound?.number ?? 0,
	)
	const fixtures = fixturesRaw.map((f) => ({
		id: f.id,
		kickoff: f.kickoff,
		homeScore: f.homeScore,
		awayScore: f.awayScore,
		status: f.status,
		homeShort: f.homeTeam.shortName,
		awayShort: f.awayTeam.shortName,
		// The sides, the authoritative winner of a penalty-decided tie and the
		// round's stage all ride along because the classic survival rule reads
		// them — the browser projects a pick with the same module the server
		// settles it with (#242).
		homeTeamId: f.homeTeamId,
		awayTeamId: f.awayTeamId,
		winner: f.winner,
		knockout: roundIsKnockout,
	}))

	// Build live projection.
	const proj = computeLiveProjection({
		competitionType: gameData.competition.type,
		// Carries the mode as well as its settings, so the projection dispatches on
		// the same value it reads `allowRebuys` / `startingLives` out of.
		modeConfig: resolveModeConfig(gameData),
		// The round being projected and the round the game began on: classic's
		// exemption hangs off the pair, and a game that started mid-season has its
		// own opening round (#203). The shared survival rule resolves it.
		roundId: gameData.currentRoundId,
		startingRoundId: gameData.startingRoundId,
		roundNumber: gameData.currentRound?.number ?? 0,
		fixtures: fixturesRaw,
		picks: picksInRound,
		players: gameData.players,
	})

	// Hide opponents' pick identity until this round's picks lock. The
	// projection above is computed server-side from the full pick set, so live
	// play is unaffected — we only strip the identifying fields (team, prediction,
	// fixture, rank, projected outcome) from the payload sent to the browser. The
	// viewer's own picks are always returned in full.
	const now = new Date()
	// With no current round there are no picks to map below, but state the fallback
	// anyway: no round row means nothing has locked, so only the viewer's own picks
	// would come back in full.
	const liveRound: PicksLockedRound = gameData.currentRound ?? {
		status: 'upcoming',
		deadline: null,
	}
	const viewerGamePlayerId = gameData.players.find((p) => p.userId === viewerUserId)?.id ?? null

	const picks: LivePick[] = picksInRound.map((p) => {
		// One rule for "may this viewer see this pick?" (#247).
		const reveal =
			resolvePickVisibility({ round: liveRound, pick: p, viewerGamePlayerId, now }) === 'visible'
		if (!reveal) {
			return {
				gamePlayerId: p.gamePlayerId,
				fixtureId: null,
				teamId: null,
				confidenceRank: null,
				predictedResult: null,
				result: 'hidden' as const,
				projectedOutcome: null,
				// Nothing to attach one to: the fixture and team are stripped just
				// above, and a chance on a hidden pick would name the team it was
				// hiding (#222).
				preMatchWinProbability: null,
			}
		}
		return {
			gamePlayerId: p.gamePlayerId,
			fixtureId: p.fixtureId,
			teamId: p.teamId,
			confidenceRank: p.confidenceRank,
			predictedResult: p.predictedResult as LivePick['predictedResult'],
			result: p.result,
			projectedOutcome: proj.pickProjections.get(p.id) ?? null,
			preMatchWinProbability: preMatchWinProbability(p, oddsByFixture),
		}
	})

	const players: LivePlayer[] = gameData.players.map((p) => {
		const projection = proj.playerProjections.get(p.id)
		return {
			id: p.id,
			userId: p.userId,
			status: p.status,
			livesRemaining: p.livesRemaining,
			projectedLivesRemaining: projection?.lives ?? p.livesRemaining,
			projectedStreak: projection?.streak ?? 0,
			projectedStatus: projection?.status ?? (p.status === 'eliminated' ? 'eliminated' : 'alive'),
		}
	})

	return {
		gameId: gameData.id,
		gameMode: gameData.gameMode,
		roundId: gameData.currentRoundId,
		fixtures,
		picks,
		players,
		viewerUserId,
		updatedAt: new Date().toISOString(),
	}
}

/* ────────────────────────────────────────────────────────────────────── */
/* Live projection                                                         */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Compute live projection for the current round. For each pick, emit a
 * projected outcome based on the fixture's current scores (settled picks
 * pass through; in-progress fixtures get `winning`/`drawing`/`losing`).
 * For each player, derive aggregates (streak, lives, alive/eliminated)
 * by running the mode-specific evaluator over the projection set.
 */
function computeLiveProjection(input: {
	competitionType: string
	modeConfig: ModeConfig
	/**
	 * The round being projected, and the round the game began on — classic's
	 * exemption is `isGameStartingRound` over the pair, and a game that started
	 * mid-season has its own (#203). The shared survival rule resolves it, so
	 * the two ids travel rather than a pre-computed flag.
	 */
	roundId: string | null
	startingRoundId: string | null
	/** Which round of the competition, so knockout ties can be told apart. */
	roundNumber: number
	fixtures: Array<{
		id: string
		homeTeamId: string
		awayTeamId: string
		homeScore: number | null
		awayScore: number | null
		regularHomeScore: number | null
		regularAwayScore: number | null
		winner: 'home' | 'away' | null
		status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
		homeTeam: { id: string; externalIds: Record<string, string | number> | null }
		awayTeam: { id: string; externalIds: Record<string, string | number> | null }
	}>
	picks: Array<typeof pick.$inferSelect>
	players: Array<typeof gamePlayer.$inferSelect>
}): {
	pickProjections: Map<string, LiveProjectedOutcome>
	playerProjections: Map<string, { streak: number; lives: number; status: 'alive' | 'eliminated' }>
} {
	const pickProjections = new Map<string, LiveProjectedOutcome>()
	const playerProjections = new Map<
		string,
		{ streak: number; lives: number; status: 'alive' | 'eliminated' }
	>()

	const fixtureById = new Map(input.fixtures.map((f) => [f.id, f]))
	// Every fixture in the round shares its stage, so the question is asked once.
	const knockout = isKnockoutRound(input.competitionType, input.roundNumber)

	for (const p of input.picks) {
		const fx = p.fixtureId ? fixtureById.get(p.fixtureId) : undefined
		pickProjections.set(p.id, projectOutcomeForPick(p, fx, knockout, input.modeConfig.mode))
	}

	for (const player of input.players) {
		const playerPicks = input.picks
			.filter((p) => p.gamePlayerId === player.id)
			.sort((a, b) => (a.confidenceRank ?? 99) - (b.confidenceRank ?? 99))

		if (input.modeConfig.mode === 'classic') {
			playerProjections.set(
				player.id,
				projectClassicPlayer(player, playerPicks, fixtureById, { ...input, knockout }),
			)
		} else if (input.modeConfig.mode === 'turbo') {
			playerProjections.set(player.id, projectTurboPlayer(player, playerPicks, fixtureById))
		} else {
			playerProjections.set(player.id, projectCupPlayer(player, playerPicks, fixtureById, input))
		}
	}

	return { pickProjections, playerProjections }
}

type LiveProjectedOutcome = NonNullable<LivePick['projectedOutcome']>

function projectOutcomeForPick(
	p: typeof pick.$inferSelect,
	fx:
		| {
				homeTeamId: string
				awayTeamId: string
				homeScore: number | null
				awayScore: number | null
				winner: 'home' | 'away' | null
				status: string
		  }
		| undefined,
	knockout: boolean,
	gameMode: 'classic' | 'turbo' | 'cup',
): LiveProjectedOutcome {
	if (p.result === 'void') return 'void'
	if (p.result === 'saved_by_life') return 'saved-by-life'
	if (p.result === 'win') return 'settled-win'
	if (p.result === 'loss') return 'settled-loss'
	if (p.result === 'draw') {
		// Cup may have draw_success persisted as 'draw' result; treat as
		// settled-win-equivalent for visual parity.
		return 'settled-win'
	}
	// Fixture cancelled but pick.result not yet persisted as 'void' (race
	// during settlement) — surface as void anyway.
	if (fx?.status === 'cancelled') return 'void'
	if (!fx || fx.homeScore == null || fx.awayScore == null) return 'pending'
	const isFinished = fx.status === 'finished'

	// Classic first, and on the MODE rather than on whether a prediction happens
	// to be stored: the picked team must come through, and the shared rule is
	// what says whether it did — the same one settlement calls, so a tie won on
	// penalties can't read as a loss here (#242) and an unresolved one stays
	// pending rather than settled (#107). Branching on `predictedResult` sent
	// classic's deadline auto-picks down the turbo path, which reads the score
	// alone: `applyRule2Classic` stores a prediction where a hand-made classic
	// pick stores none, so one payload could call the same pick a loss on its
	// card and its backer alive on their row.
	if (gameMode === 'classic') {
		const { result, defer } = resolveClassicPickResult(p, { ...fx, knockout })
		if (defer || result == null) return 'pending'
		if (result === 'win') return isFinished ? 'settled-win' : 'winning'
		if (result === 'draw') return isFinished ? 'settled-loss' : 'drawing'
		return isFinished ? 'settled-loss' : 'losing'
	}

	// Turbo / cup: the call is the prediction, and it may be a draw.
	const predicted = p.predictedResult
	if (predicted) {
		const actualOutcome =
			fx.homeScore > fx.awayScore ? 'home_win' : fx.awayScore > fx.homeScore ? 'away_win' : 'draw'
		if (predicted === actualOutcome) return isFinished ? 'settled-win' : 'winning'
		return isFinished ? 'settled-loss' : 'losing'
	}
	return 'pending'
}

function projectClassicPlayer(
	player: typeof gamePlayer.$inferSelect,
	playerPicks: Array<typeof pick.$inferSelect>,
	fixtureById: Map<
		string,
		{
			id: string
			homeTeamId: string
			awayTeamId: string
			homeScore: number | null
			awayScore: number | null
			winner: 'home' | 'away' | null
			status: string
		}
	>,
	input: {
		modeConfig: ModeConfig
		roundId: string | null
		startingRoundId: string | null
		knockout: boolean
	},
): { streak: number; lives: number; status: 'alive' | 'eliminated' } {
	if (player.status === 'eliminated') {
		return { streak: 0, lives: 0, status: 'eliminated' }
	}
	if (playerPicks.length === 0) return { streak: 0, lives: 0, status: 'alive' }
	// Classic has one pick per round; project elimination if any in-progress
	// pick is losing/drawing AND not in starting round. Voided picks don't
	// count — player stays alive on them per the cancellation design. Whether a
	// pick eliminates is the shared survival rule's answer, exemption included
	// (#242) — a deferred tie eliminates nobody, since settlement writes nothing.
	for (const p of playerPicks) {
		if (p.result === 'void') continue
		const fx = p.fixtureId ? fixtureById.get(p.fixtureId) : undefined
		if (!fx || fx.status === 'cancelled') continue
		const outcome = settleClassicPick(
			p,
			{ ...fx, roundId: input.roundId ?? '', knockout: input.knockout },
			{ startingRoundId: input.startingRoundId, modeConfig: input.modeConfig },
		)
		if (outcome.eliminates) {
			return { streak: 0, lives: 0, status: 'eliminated' }
		}
	}
	return { streak: 0, lives: 0, status: 'alive' }
}

function projectTurboPlayer(
	player: typeof gamePlayer.$inferSelect,
	playerPicks: Array<typeof pick.$inferSelect>,
	fixtureById: Map<
		string,
		{
			homeScore: number | null
			awayScore: number | null
			status: string
		}
	>,
): { streak: number; lives: number; status: 'alive' | 'eliminated' } {
	if (player.status === 'eliminated') {
		return { streak: 0, lives: 0, status: 'eliminated' }
	}
	// Project streak through rank order, treating in-progress fixtures by
	// current score. Stops at the first projected loss. Voided picks are
	// skipped (streak walks past them as if they weren't in the input).
	let streak = 0
	for (const p of playerPicks) {
		if (p.result === 'void') continue
		const fx = p.fixtureId ? fixtureById.get(p.fixtureId) : undefined
		if (!fx) break
		if (fx.status === 'cancelled') continue
		if (fx.homeScore == null || fx.awayScore == null) break
		const actualOutcome =
			fx.homeScore > fx.awayScore ? 'home_win' : fx.awayScore > fx.homeScore ? 'away_win' : 'draw'
		if (p.predictedResult === actualOutcome) streak++
		else break
	}
	return { streak, lives: 0, status: 'alive' }
}

function projectCupPlayer(
	player: typeof gamePlayer.$inferSelect,
	playerPicks: Array<typeof pick.$inferSelect>,
	fixtureById: Map<
		string,
		{
			homeTeamId: string
			awayTeamId: string
			homeScore: number | null
			awayScore: number | null
			winner: 'home' | 'away' | null
			status: string
			homeTeam: { externalIds: Record<string, string | number> | null }
			awayTeam: { externalIds: Record<string, string | number> | null }
			regularHomeScore: number | null
			regularAwayScore: number | null
		}
	>,
	input: { competitionType: string; modeConfig: ModeConfig },
): { streak: number; lives: number; status: 'alive' | 'eliminated' } {
	if (player.status === 'eliminated') {
		return { streak: 0, lives: 0, status: 'eliminated' }
	}
	// Build cup-pick inputs from all picks where the fixture has scores
	// (settled OR in-progress). Run through evaluateCupPicks with the
	// starting lives the player would have had at the start of the round.
	const inputs: Array<{
		confidenceRank: number
		pickedTeam: 'home' | 'away'
		homeScore: number
		awayScore: number
		tierDifference: number
		winner: 'home' | 'away' | null
	}> = []
	for (const p of playerPicks) {
		if (p.result === 'void') continue
		const fx = p.fixtureId ? fixtureById.get(p.fixtureId) : undefined
		if (!fx) continue
		if (fx.status === 'cancelled') continue
		if (fx.homeScore == null || fx.awayScore == null) continue
		const pickedTeam: 'home' | 'away' = p.teamId === fx.homeTeamId ? 'home' : 'away'
		const tierDiff = computeTierDifference(
			fx.homeTeam,
			fx.awayTeam,
			input.competitionType as 'league' | 'knockout' | 'group_knockout',
		)
		inputs.push({
			confidenceRank: p.confidenceRank ?? 0,
			pickedTeam,
			// Prefer the 90-minute (regulation) score so the projection matches the
			// eventual settled result for knockout ties; falls back to the live /
			// full-time score while a match is in progress (regulation not yet set).
			homeScore: fx.regularHomeScore ?? fx.homeScore,
			awayScore: fx.regularAwayScore ?? fx.awayScore,
			tierDifference: tierDiff,
			// "To qualify": a finished tie's winner (incl. ET/penalties) decides a
			// win; derived from the penalty-inclusive full-time score when winner
			// lags. A still-in-play match resolves to null → projects on the 90-min
			// score, matching the cell projection.
			winner: resolveCupQualifier({
				winner: fx.winner,
				finished: fx.status === 'finished',
				fullHomeScore: fx.homeScore,
				fullAwayScore: fx.awayScore,
			}),
		})
	}
	if (inputs.length === 0) {
		return { streak: 0, lives: player.livesRemaining, status: 'alive' }
	}
	// Starting lives for the round: player.livesRemaining represents lives
	// AT THIS MOMENT — re-eval starts from this, then accumulates from
	// scratch over the picks. To project the round's outcome consistently
	// across both settled + projected fixtures, we start from "lives before
	// this round started". For mid-round live state we approximate with the
	// current persisted livesRemaining; this drifts slightly post-settle
	// (since some lives may already be persisted) but the design accepts
	// that — live aggregates are inherently approximate.
	//
	// The game's configured lives win where the mode has them, which is every
	// game that reaches here. A cup game whose config omits the field resolves to
	// 0 rather than to `livesRemaining` as it did before #248 — that is the value
	// settlement uses, so the projection now matches what will be persisted.
	const startingLives =
		input.modeConfig.mode === 'cup' ? input.modeConfig.startingLives : player.livesRemaining
	const result = evaluateCupPicks(inputs, startingLives)
	const streak = result.pickResults.filter(
		(r) => r.result === 'win' || r.result === 'draw_success' || r.result === 'saved_by_life',
	).length
	return {
		streak,
		lives: result.finalLives,
		status: result.eliminated ? 'eliminated' : 'alive',
	}
}
