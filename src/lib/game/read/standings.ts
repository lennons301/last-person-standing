import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isKnockoutRound, resolveClassicPickResult } from '@/lib/game/classic-survival'
import { activeField } from '@/lib/game/elimination'
import type { FixtureRecordStatus } from '@/lib/game/fixture-phase'
import { resolvePickVisibility } from '@/lib/game/pick-visibility'
import { roundLabel, roundLabelLong } from '@/lib/game/round-label'
import { arePicksLocked, deriveGameRoundStatus } from '@/lib/game/round-status'
import { isGameStartingRound } from '@/lib/game/starting-round'
import {
	type FixtureOutcomes,
	type Outcome,
	type WinScenarios,
	winScenarios,
} from '@/lib/game-logic/win-scenarios'
import { game } from '@/lib/schema/game'
import type { PlayerStatus } from '@/lib/types'

/**
 * The two multi-player standings reads — classic's progress grid and turbo's
 * round view — each declaring the shape it hands over, so a consumer (the game
 * page, the share images, the winner banner) names a type instead of typing
 * itself off the implementation (#249).
 */

export interface GridRound {
	id: string
	number: number
	name: string
	/** Short label for column headers, e.g. "GW1" / "MD1" / "R16". */
	label: string
	isStartingRound?: boolean
	/**
	 * Whether this round's picks are locked and revealable to everyone — the
	 * round has been processed, or its OWN deadline has passed (`arePicksLocked`,
	 * which reads the round and never the game, so a finished game doesn't turn
	 * its unplayed rounds locked). False for a future round carrying advance
	 * picks (PR #81), which commit real pick rows against a round that hasn't
	 * opened. Required, not optional, for the same reason the cells' hide rule is
	 * derived and not assumed: a caller that filters columns on it (the classic
	 * share image, #225) must never read a missing field as "locked". Plain
	 * boolean so the descriptor stays JSON-serialisable across the server→client
	 * boundary.
	 */
	picksLocked: boolean
	/**
	 * Non-null when this round was voided (classic threshold crossed —
	 * see cancellation design doc). UI renders the column with prominent
	 * "round voided" treatment.
	 */
	voidedAt?: Date | string | null
}

export interface GridCell {
	result:
		| 'win'
		| 'loss'
		| 'draw'
		| 'draw_exempt'
		| 'saved'
		| 'pending'
		| 'locked'
		| 'skull'
		| 'empty'
		| 'no_pick'
		/** Pick on a cancelled fixture (or pick in a voided round). */
		| 'void'
	teamShortName?: string
	opponentShortName?: string
	homeAway?: 'H' | 'A'
	score?: string
	isAuto?: boolean
	/**
	 * True on the cell for the round in which this player was eliminated, when a
	 * real pick exists for that round. The pick + result render as normal and a
	 * skull marker is overlaid — so a pick that actually won (but the player was
	 * still eliminated) stays visible rather than being replaced by a bare skull.
	 * The bare `result: 'skull'` cell is kept only for elimination rounds with no
	 * pick (e.g. a no-pick elimination).
	 */
	eliminatedHere?: boolean
	/**
	 * The fixture this pick sits on. Set together with `teamId` whenever the
	 * pick's fixture is revealed (i.e. `teamShortName`/`opponentShortName`
	 * above are set too) — never on a hidden (`locked`), unplayed (`no_pick`)
	 * or pick-less (`skull`, `empty`) cell, so its presence alone is what
	 * makes a cell tappable (#226).
	 */
	fixtureId?: string
	teamId?: string
	opponentTeamId?: string
	kickoff?: Date | string | null
	fixtureStatus?: FixtureRecordStatus
}

export interface GridPlayer {
	id: string
	/** Present in the live grid (used by admin remove); omitted in the share image. */
	userId?: string
	name: string
	status: PlayerStatus
	eliminatedRoundNumber?: number
	eliminatedRoundLabel?: string
	/** Total goals scored by this player's winning picks (classic tiebreaker). */
	goals: number
	cellsByRoundId: Record<string, GridCell>
}

/**
 * Classic's progress grid. No pot figure on purpose: the page's stat line owns
 * the pot headline, so the standings section neither queries nor prints one.
 */
export interface GridView {
	rounds: GridRound[]
	players: GridPlayer[]
	aliveCount: number
	eliminatedCount: number
	/** Threaded through so a tapped cell can open the fixture-detail sheet (#226). */
	competitionId: string
}

/** One of a turbo player's ranked calls, as the grid view renders it. */
export interface TurboStandingsCell {
	rank: number
	homeShort: string
	awayShort: string
	prediction: 'home_win' | 'draw' | 'away_win'
	result: 'win' | 'loss' | 'pending' | 'hidden'
	opponentScore?: string
	goalsCounted: number
}

export interface TurboStandingsPlayer {
	id: string
	userId: string
	name: string
	picks: TurboStandingsCell[]
	streak: number
	goals: number
	hasSubmitted: boolean
}

/** One player's call on one fixture, for the ladder (fixture-first) view. */
export interface TurboStandingsPrediction {
	playerId: string
	playerName: string
	prediction: 'home_win' | 'draw' | 'away_win'
	rank: number
	correct: boolean | null
	streakBroken: boolean
	hidden: boolean
}

export interface TurboStandingsFixture {
	id: string
	home: { shortName: string; name: string; badgeUrl?: string | null }
	away: { shortName: string; name: string; badgeUrl?: string | null }
	kickoff: Date | null
	homeScore: number | null
	awayScore: number | null
	actualOutcome: 'home_win' | 'draw' | 'away_win' | null
	avgRank: number
	predictions: TurboStandingsPrediction[]
}

export interface TurboStandingsRound {
	id: string
	number: number
	name: string
	label: string
	status: 'open' | 'active' | 'completed'
	players: TurboStandingsPlayer[]
	fixtures: TurboStandingsFixture[]
	/** win-scenario analysis; null pre-deadline (picks hidden) or when not computed. */
	scenarios: WinScenarios | null
}

/**
 * Turbo is single-round, so this is one round in all but the shape: the array
 * carries the round the game is tied to, recovered from its picks once the game
 * completes and `currentRoundId` is nulled.
 */
export interface TurboStandings {
	rounds: TurboStandingsRound[]
}

export async function getTurboStandingsData(
	gameId: string,
	viewerUserId?: string,
	/**
	 * `hideUnlockedPicks`: hide every pick whose round hasn't locked, the viewer's
	 * own included — what a shared surface asks for, since the whole group sees
	 * it. One name across both standings queries on purpose: it is one request,
	 * and it was spelled two ways (#247).
	 */
	options?: { hideUnlockedPicks?: boolean },
): Promise<TurboStandings | null> {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			players: true,
			currentRound: true,
			competition: {
				with: {
					rounds: { orderBy: (r, { asc }) => asc(r.number) },
				},
			},
			picks: {
				with: {
					fixture: { with: { homeTeam: true, awayTeam: true } },
					round: true,
				},
			},
		},
	})
	if (!gameData) return null

	const viewerGamePlayerId = viewerUserId
		? gameData.players.find((p) => p.userId === viewerUserId)?.id
		: undefined

	const { user } = await import('@/lib/schema/auth')
	const userRows =
		gameData.players.length > 0
			? await db
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(
						inArray(
							user.id,
							gameData.players.map((p) => p.userId),
						),
					)
			: []
	const userNames = new Map(userRows.map((u) => [u.id, u.name]))

	// Turbo is a single-gameweek game — surface the one round this game is tied to.
	// `currentRound` is nulled out when the game completes (see settle.ts), so on
	// completed games we recover the round from picks instead. Without this, the
	// standings grid disappears the moment a turbo game finishes.
	const pickRoundIds = new Set(
		gameData.picks.map((pk) => pk.roundId).filter((id): id is string => id != null),
	)
	const visibleRounds = gameData.currentRound
		? [gameData.currentRound]
		: gameData.competition.rounds.filter((r) => pickRoundIds.has(r.id))
	const primaryRoundId = visibleRounds[0]?.id ?? gameData.currentRoundId

	// Precompute each player's streak progression so we can mark streak-breaker cells
	// at the fixture level in the ladder view.
	const playerStreakBreakRank = new Map<string, number | null>() // playerId -> rank where streak broke, or null
	for (const p of gameData.players) {
		const picks = gameData.picks
			.filter((pk) => pk.gamePlayerId === p.id && pk.roundId === primaryRoundId)
			.sort((a, b) => (a.confidenceRank ?? 99) - (b.confidenceRank ?? 99))
		let broken: number | null = null
		for (const pk of picks) {
			if (pk.result !== 'win' && pk.result !== 'pending') {
				broken = pk.confidenceRank ?? null
				break
			}
		}
		playerStreakBreakRank.set(p.id, broken)
	}

	const now = new Date()
	const turboCompetitionType = gameData.competition.type

	return {
		rounds: visibleRounds.map((r) => {
			// Per-game round status — see src/lib/game/round-status.ts. `r.status`
			// alone isn't enough: the competition-level round flips to 'completed'
			// only after every fixture has settled, which can be 2+ days after the
			// pick deadline. We need the deadline-aware derived status so picks
			// reveal the moment the deadline passes, not when the last whistle blows.
			const derivedStatus = deriveGameRoundStatus({
				round: { id: r.id, number: r.number, status: r.status, deadline: r.deadline },
				game: {
					currentRoundId: gameData.currentRoundId,
					currentRoundNumber: gameData.currentRound?.number ?? null,
				},
				now,
			})
			const isRoundOpen = derivedStatus === 'open'
			// May this viewer see this player's picks for this round? One module owns
			// the rule (#247) — `hideUnlockedPicks` (the share-image path) is stated
			// as "no viewer to make an exception for", and a round the GAME has
			// finished with is revealed wholesale (a completed turbo game nulls
			// `currentRoundId`, which is how its standings stay readable).
			const pickHidden = (gamePlayerId: string) =>
				resolvePickVisibility({
					round: r,
					pick: { gamePlayerId },
					viewerGamePlayerId: options?.hideUnlockedPicks ? null : viewerGamePlayerId,
					now,
					revealAll: derivedStatus === 'completed',
				}) === 'hidden'

			const players: TurboStandingsPlayer[] = gameData.players.map((p) => {
				const playerPicks = gameData.picks
					.filter((pk) => pk.gamePlayerId === p.id && pk.roundId === r.id)
					.sort((a, b) => (a.confidenceRank ?? 99) - (b.confidenceRank ?? 99))

				const hideCells = pickHidden(p.id)

				// Streak + goals. For completed rounds: persisted pick.result drives
				// it. For in-progress rounds: project from current scores — same
				// rule, but `pk.result === 'pending'` falls through to a per-fixture
				// score check. Players see their live streak update as fixtures
				// progress, in addition to the projection in /api/games/[id]/live.
				let streak = 0
				let goals = 0
				{
					let broken = false
					for (const pk of playerPicks) {
						if (broken) continue
						let correctForStreak: boolean | null
						if (pk.result === 'win') correctForStreak = true
						else if (pk.result === 'loss') correctForStreak = false
						else if (pk.fixture && pk.fixture.homeScore != null && pk.fixture.awayScore != null) {
							const actual =
								pk.fixture.homeScore > pk.fixture.awayScore
									? 'home_win'
									: pk.fixture.awayScore > pk.fixture.homeScore
										? 'away_win'
										: 'draw'
							correctForStreak = pk.predictedResult === actual
						} else correctForStreak = null // unstarted fixture — stop counting
						if (correctForStreak === null) break
						if (correctForStreak) {
							streak++
							// Use persisted goalsScored if settled; otherwise project.
							if (pk.result === 'win') goals += pk.goalsScored ?? 0
							else if (pk.fixture) {
								if (pk.predictedResult === 'home_win') goals += pk.fixture.homeScore ?? 0
								else if (pk.predictedResult === 'away_win') goals += pk.fixture.awayScore ?? 0
								else goals += (pk.fixture.homeScore ?? 0) + (pk.fixture.awayScore ?? 0)
							}
						} else {
							broken = true
						}
					}
				}

				const cells: TurboStandingsCell[] = playerPicks.map((pk) => {
					const homeShort = pk.fixture?.homeTeam?.shortName ?? '?'
					const awayShort = pk.fixture?.awayTeam?.shortName ?? '?'
					const scorePart =
						pk.fixture?.homeScore != null && pk.fixture.awayScore != null
							? `${pk.fixture.homeScore}-${pk.fixture.awayScore}`
							: undefined
					const prediction = (pk.predictedResult ?? 'draw') as 'home_win' | 'draw' | 'away_win'

					// In-progress projection: pending picks on fixtures with live
					// scores render as win/loss based on the current actual outcome.
					// Same visual as a settled pick of that result; fixture status
					// communicates that nothing is finalised yet.
					let result: TurboStandingsCell['result']
					if (hideCells) result = 'hidden'
					else if (pk.result === 'win') result = 'win'
					else if (pk.result === 'loss') result = 'loss'
					else if (pk.fixture && pk.fixture.homeScore != null && pk.fixture.awayScore != null) {
						const actualOutcome: 'home_win' | 'draw' | 'away_win' =
							pk.fixture.homeScore > pk.fixture.awayScore
								? 'home_win'
								: pk.fixture.awayScore > pk.fixture.homeScore
									? 'away_win'
									: 'draw'
						result = prediction === actualOutcome ? 'win' : 'loss'
					} else result = 'pending'

					return {
						rank: pk.confidenceRank ?? 0,
						homeShort,
						awayShort,
						prediction,
						result,
						opponentScore: scorePart,
						goalsCounted: pk.goalsScored ?? 0,
					}
				})

				return {
					id: p.id,
					userId: p.userId,
					name: userNames.get(p.userId) ?? 'Player',
					picks: cells,
					streak,
					goals,
					hasSubmitted: playerPicks.length > 0,
				}
			})

			// Fixture-level ladder view: one row per fixture, each with predictions broken down
			const fixtureMap = new Map<string, TurboStandingsFixture>()

			for (const p of gameData.players) {
				const playerName = userNames.get(p.userId) ?? 'Player'
				const streakBreakRank = playerStreakBreakRank.get(p.id)
				const hideThisPlayerInOpenRound = pickHidden(p.id)

				const playerPicks = gameData.picks.filter(
					(pk) => pk.gamePlayerId === p.id && pk.roundId === r.id,
				)

				for (const pk of playerPicks) {
					if (!pk.fixture || !pk.fixtureId) continue
					let entry = fixtureMap.get(pk.fixtureId)
					if (!entry) {
						const hs = pk.fixture.homeScore
						const as = pk.fixture.awayScore
						let actualOutcome: 'home_win' | 'draw' | 'away_win' | null = null
						if (hs != null && as != null) {
							actualOutcome = hs > as ? 'home_win' : as > hs ? 'away_win' : 'draw'
						}
						entry = {
							id: pk.fixtureId,
							home: {
								shortName: pk.fixture.homeTeam?.shortName ?? '?',
								name: pk.fixture.homeTeam?.name ?? '?',
								badgeUrl: pk.fixture.homeTeam?.badgeUrl,
							},
							away: {
								shortName: pk.fixture.awayTeam?.shortName ?? '?',
								name: pk.fixture.awayTeam?.name ?? '?',
								badgeUrl: pk.fixture.awayTeam?.badgeUrl,
							},
							kickoff: pk.fixture.kickoff,
							homeScore: hs,
							awayScore: as,
							actualOutcome,
							avgRank: 0,
							predictions: [],
						}
						fixtureMap.set(pk.fixtureId, entry)
					}
					const prediction = (pk.predictedResult ?? 'draw') as 'home_win' | 'draw' | 'away_win'
					const correct = entry.actualOutcome == null ? null : entry.actualOutcome === prediction
					const rank = pk.confidenceRank ?? 0
					const streakBroken = streakBreakRank === rank
					entry.predictions.push({
						playerId: p.id,
						playerName,
						prediction,
						rank,
						correct,
						streakBroken,
						hidden: hideThisPlayerInOpenRound,
					})
				}
			}

			// Compute average rank across predictions, then sort fixtures by it so the
			// ladder reads in "most collectively important" order.
			const fixtures = Array.from(fixtureMap.values()).map((f) => ({
				...f,
				avgRank:
					f.predictions.length > 0
						? f.predictions.reduce((s, p) => s + p.rank, 0) / f.predictions.length
						: 99,
			}))
			fixtures.sort((a, b) => a.avgRank - b.avgRank)

			// Win scenarios — only once the deadline has passed. Pre-deadline picks
			// are hidden, and "who needs what to win" would leak them, so the engine
			// is skipped while the round is open.
			let scenarios: WinScenarios | null = null
			if (!isRoundOpen) {
				const roundPicks = gameData.picks.filter((pk) => pk.roundId === r.id && pk.fixtureId)
				const fixtureOutcomes: FixtureOutcomes = {}
				for (const pk of roundPicks) {
					const fx = pk.fixture
					if (!fx || !pk.fixtureId || pk.fixtureId in fixtureOutcomes) continue
					// Only a FINISHED fixture is a known outcome; in-progress fixtures are
					// still undecided (treated as unplayed for scenario purposes).
					fixtureOutcomes[pk.fixtureId] =
						fx.status === 'finished' && fx.homeScore != null && fx.awayScore != null
							? fx.homeScore > fx.awayScore
								? 'home_win'
								: fx.awayScore > fx.homeScore
									? 'away_win'
									: 'draw'
							: null
				}
				const scenarioPlayers = gameData.players.map((p) => ({
					gamePlayerId: p.id,
					livesRemaining: 0,
					picks: roundPicks
						.filter((pk) => pk.gamePlayerId === p.id)
						.map((pk) => ({
							rank: pk.confidenceRank ?? 0,
							fixtureId: pk.fixtureId as string,
							predictedResult: (pk.predictedResult ?? 'draw') as Outcome,
						})),
				}))
				scenarios = winScenarios(scenarioPlayers, fixtureOutcomes, { mode: 'turbo' })
			}

			return {
				id: r.id,
				number: r.number,
				name: r.name ?? roundLabelLong(turboCompetitionType, r.number),
				label: roundLabel(turboCompetitionType, r.number),
				status: derivedStatus as 'open' | 'active' | 'completed',
				players,
				fixtures,
				scenarios,
			}
		}),
	}
}

export async function getProgressGridData(
	gameId: string,
	viewerUserId?: string,
	/** `hideUnlockedPicks`: as on `getTurboStandingsData` — the shared-surface ask. */
	options?: { hideUnlockedPicks?: boolean },
): Promise<GridView | null> {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			players: true,
			competition: {
				with: {
					rounds: { orderBy: (r, { asc }) => asc(r.number) },
				},
			},
			picks: {
				with: {
					team: true,
					round: true,
					fixture: { with: { homeTeam: true, awayTeam: true } },
				},
			},
		},
	})

	if (!gameData) return null

	// Admin-removed players don't appear in the standings grid.
	gameData.players = activeField(gameData.players)

	// Identify the viewer's gamePlayer so we can still show them their own current pick,
	// while hiding other players' picks for in-progress (not completed) rounds.
	const viewerGamePlayerId = viewerUserId
		? gameData.players.find((p) => p.userId === viewerUserId)?.id
		: undefined

	// Show only rounds the GAME has touched, not every round the competition
	// happens to have completed in the wider world. A round counts as touched
	// if any player has a pick on it OR it's the game's current round. This
	// keeps a brand-new PL game and a brand-new WC game looking identical
	// (one column for the current round) rather than diverging based on how
	// much of each competition has already played out.
	const touchedRoundIds = new Set<string>()
	for (const p of gameData.picks) touchedRoundIds.add(p.roundId)
	if (gameData.currentRoundId) touchedRoundIds.add(gameData.currentRoundId)

	const completedAndCurrentRounds = gameData.competition.rounds.filter((r) =>
		touchedRoundIds.has(r.id),
	)

	// Pre-compute per-game derived status for each round. Using `r.status` alone
	// keeps picks locked even after the deadline (round.status flips to
	// 'completed' only when every fixture has settled). The derived status
	// returns 'open' only while deadline > now.
	const now = new Date()
	const currentRoundNumber =
		gameData.competition.rounds.find((r) => r.id === gameData.currentRoundId)?.number ?? null
	// Rounds this GAME has finished with — advanced past, or every round of a game
	// that is itself over (completion nulls `currentRoundId`, and
	// `deriveGameRoundStatus` then calls the lot 'completed'). This is the only
	// thing the on-screen grid's per-cell reveal adds to the round's own lock, and
	// it is passed to `resolvePickVisibility` as `revealAll` below rather than
	// re-stating the lock rule: a player looking back at a game they played sees
	// the field's picks for every round of it.
	const gameFinishedWithRoundIds = new Set<string>()
	for (const r of gameData.competition.rounds) {
		const status = deriveGameRoundStatus({
			round: { id: r.id, number: r.number, status: r.status, deadline: r.deadline },
			game: { currentRoundId: gameData.currentRoundId, currentRoundNumber },
			now,
		})
		if (status === 'completed') gameFinishedWithRoundIds.add(r.id)
	}

	const competitionType = gameData.competition.type
	// The row is carried beside the descriptor because the per-cell visibility rule
	// below needs the round's own status and deadline, which `GridRound` doesn't
	// carry (it crosses to the client).
	const displayRounds = completedAndCurrentRounds.map((row) => ({
		row,
		grid: {
			id: row.id,
			number: row.number,
			name: row.name ?? roundLabelLong(competitionType, row.number),
			label: roundLabel(competitionType, row.number),
			// The game's own opening round, not the competition's gameweek one — a game
			// created in November is marked on gameweek 12 (#203).
			isStartingRound: isGameStartingRound(gameData, row.id),
			// Surfaced on the descriptor, not just consumed per-cell below: the classic
			// share image filters its columns on it so a far-future advance-pick round
			// never reaches the layout's six-column tail (#225).
			//
			// The round's OWN rule, with no game-relative reveal, and the difference
			// matters exactly once: a completed game has no `currentRoundId`, so
			// `deriveGameRoundStatus` calls every round 'completed' — which would put
			// an untouched future gameweek back in the share the moment a game ends.
			// The cells keep the game-relative reveal, so the on-screen grid is unmoved.
			picksLocked: arePicksLocked(row, now),
			voidedAt: row.voidedAt ?? null,
		} satisfies GridRound,
	}))
	const rounds: GridRound[] = displayRounds.map((r) => r.grid)

	// Get user names for players
	const { user } = await import('@/lib/schema/auth')
	const userRows =
		gameData.players.length > 0
			? await db
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(
						inArray(
							user.id,
							gameData.players.map((p) => p.userId),
						),
					)
			: []
	const userNames = new Map(userRows.map((u) => [u.id, u.name]))

	const players: GridPlayer[] = gameData.players.map((p) => {
		const cellsByRoundId: Record<string, GridCell> = {}
		for (const { row, grid: r } of displayRounds) {
			const thePick = gameData.picks.find((pk) => pk.gamePlayerId === p.id && pk.roundId === r.id)

			// Elimination round with NO pick (e.g. a no-pick elimination) → bare
			// skull. With a pick, fall through and render the pick + result as
			// normal, flagged `eliminatedHere` so a skull marker is overlaid — a
			// pick that actually won stays visible instead of being hidden.
			if (p.status === 'eliminated' && p.eliminatedRoundId === r.id && !thePick) {
				cellsByRoundId[r.id] = { result: 'skull' }
				continue
			}
			if (p.status === 'eliminated') {
				// After elimination — leave empty
				if (!thePick) {
					cellsByRoundId[r.id] = { result: 'empty' }
					continue
				}
			}
			if (!thePick) {
				// Always show "?" for players who haven't picked yet — acts as a nudge.
				cellsByRoundId[r.id] = { result: 'no_pick' }
				continue
			}

			// May this viewer see this pick? One module owns that (#247). The
			// round's own lock covers the current open round AND future
			// advance-pick rounds (PR #81), which is what the leak was (#86);
			// `hideUnlockedPicks` (the share-image path) is stated as "there is
			// no viewer to make an exception for", so a not-yet-locked pick stays
			// hidden from everyone, its own picker included.
			const hideTeam =
				resolvePickVisibility({
					round: row,
					pick: thePick,
					viewerGamePlayerId: options?.hideUnlockedPicks ? null : viewerGamePlayerId,
					now,
					revealAll: gameFinishedWithRoundIds.has(r.id),
				}) === 'hidden'

			// A pick that's in but hidden shows "locked".
			if (hideTeam) {
				cellsByRoundId[r.id] = { result: 'locked' }
				continue
			}

			// In classic, draws eliminate after the starting round — render them as losses.
			// The starting round is the round the game began on, whichever gameweek of
			// the competition that is (#203).
			//
			// For in-progress fixtures (pending result but fixture has scores), we
			// project the cell visuals from the live score — the design decision
			// is that an in-progress pick renders with the same treatment as the
			// settled equivalent. Fixture status (live scores pop-out / kickoff time)
			// conveys "in progress" to the viewer.
			//
			// Voided picks (fixture cancelled or whole round voided) get the
			// distinct 'void' cell — no settled equivalent exists.
			let resultForCell: GridCell['result']
			if (thePick.result === 'void') resultForCell = 'void'
			else if (thePick.result === 'win') resultForCell = 'win'
			else if (thePick.result === 'loss') resultForCell = 'loss'
			else if (thePick.result === 'draw') resultForCell = r.isStartingRound ? 'draw_exempt' : 'loss'
			else if (thePick.result === 'saved_by_life') resultForCell = 'saved'
			else {
				resultForCell = projectClassicCellFromFixture(
					thePick,
					r.isStartingRound ?? false,
					isKnockoutRound(competitionType, r.number),
				)
			}

			let opponentShortName: string | undefined
			let opponentTeamId: string | undefined
			let homeAway: 'H' | 'A' | undefined
			let score: string | undefined
			if (thePick.fixture) {
				const pickedHome = thePick.teamId === thePick.fixture.homeTeamId
				homeAway = pickedHome ? 'H' : 'A'
				opponentShortName = pickedHome
					? thePick.fixture.awayTeam?.shortName
					: thePick.fixture.homeTeam?.shortName
				opponentTeamId = pickedHome ? thePick.fixture.awayTeamId : thePick.fixture.homeTeamId
				if (thePick.fixture.homeScore != null && thePick.fixture.awayScore != null) {
					score = pickedHome
						? `${thePick.fixture.homeScore}-${thePick.fixture.awayScore}`
						: `${thePick.fixture.awayScore}-${thePick.fixture.homeScore}`
				}
			}

			cellsByRoundId[r.id] = {
				result: resultForCell,
				teamShortName: thePick.team?.shortName,
				opponentShortName,
				homeAway,
				score,
				isAuto: thePick.isAuto,
				eliminatedHere:
					p.status === 'eliminated' && p.eliminatedRoundId === r.id ? true : undefined,
				// Tapping the cell opens fixture details (#226) — only where the
				// fixture itself is revealed above, same condition as `opponentShortName`.
				fixtureId: thePick.fixture?.id,
				teamId: thePick.fixture ? thePick.teamId : undefined,
				opponentTeamId,
				kickoff: thePick.fixture?.kickoff,
				fixtureStatus: thePick.fixture?.status,
			}
		}

		const eliminatedRoundNumber = p.eliminatedRoundId
			? gameData.competition.rounds.find((r) => r.id === p.eliminatedRoundId)?.number
			: undefined
		// Total goals scored by this player's winning picks (the classic
		// tiebreaker). settle persists goalsScored = picked team's goals on a
		// win, 0 otherwise — so summing across all picks is the running total.
		// Pending/hidden current-round picks have goalsScored 0, so nothing leaks.
		const goals = gameData.picks
			.filter((pk) => pk.gamePlayerId === p.id)
			.reduce((sum, pk) => sum + (pk.goalsScored ?? 0), 0)
		return {
			id: p.id,
			userId: p.userId,
			name: userNames.get(p.userId) ?? 'Player',
			status: p.status,
			eliminatedRoundNumber,
			eliminatedRoundLabel:
				eliminatedRoundNumber != null
					? roundLabel(competitionType, eliminatedRoundNumber)
					: undefined,
			goals,
			cellsByRoundId,
		}
	})

	const aliveCount = players.filter((p) => p.status === 'alive').length
	const eliminatedCount = players.filter((p) => p.status === 'eliminated').length

	// No pot figure here on purpose: the page's stat line owns the pot headline,
	// so the standings section neither queries nor prints one.
	return { rounds, players, aliveCount, eliminatedCount, competitionId: gameData.competition.id }
}

/**
 * Project a classic progress-grid cell from the fixture's current scores.
 * Used when pick.result is still 'pending' — renders the cell with the
 * same visual treatment as a settled pick of the projected result.
 *
 * Falls back to 'pending' (neutral cell) when the fixture has no scores
 * yet (pre-kickoff).
 */
function projectClassicCellFromFixture(
	thePick: {
		teamId: string
		fixture?: {
			homeTeamId: string
			awayTeamId: string
			homeScore: number | null
			awayScore: number | null
			winner: 'home' | 'away' | null
			status: string
		} | null
	},
	isStartingRound: boolean,
	knockout: boolean,
): GridCell['result'] {
	const fx = thePick.fixture
	if (!fx) return 'pending'
	// The shared survival rule, so a projected cell can't contradict the settled
	// one it turns into: it reads `fixture.winner` (a tie won on penalties is a
	// win, #242) and defers an unresolved tie rather than calling it a draw
	// (#107). The draw → cell mapping stays here beside the settled branch's,
	// which is display and not survival.
	const { result, defer } = resolveClassicPickResult(thePick, { ...fx, knockout })
	if (defer || result == null) return 'pending'
	if (result === 'win') return 'win'
	if (result === 'draw') return isStartingRound ? 'draw_exempt' : 'loss'
	return 'loss'
}
