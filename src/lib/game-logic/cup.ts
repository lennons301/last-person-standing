export interface CupPickInput {
	confidenceRank: number
	pickedTeam: 'home' | 'away'
	// The 90-MINUTE (regulation) score — the result used for the "draw floor" and
	// for counting goals. A knockout pick is "to qualify": the `winner` below
	// decides whether the picked team advanced; the 90-minute score only matters
	// when the team did NOT qualify (a level-at-90 side is floored at a draw, so a
	// handicapped underdog that drew at 90 but lost on penalties still survives —
	// the same "draw and survive" behaviour the group stage had).
	homeScore: number
	awayScore: number
	tierDifference: number // from HOME team perspective: positive = home higher tier
	// Authoritative qualification outcome for a knockout tie ('home' | 'away'),
	// incl. ties decided in ET/penalties. When the picked side qualifies it is a
	// WIN regardless of the level 90-minute score (and an underdog earns its life);
	// when it does NOT qualify but was level at 90 it is floored at a draw rather
	// than a loss. `null`/`undefined` → no qualification decided (group draw, or a
	// match still in play): fall back to the 90-minute score. Group/league wins
	// and losses set `winner` too, so the same logic scores them correctly.
	winner?: 'home' | 'away' | null
}

export interface CupPickResult {
	confidenceRank: number
	result: 'win' | 'draw_success' | 'saved_by_life' | 'loss' | 'restricted'
	livesGained: number
	goalsCounted: number
	restricted: boolean
}

export interface CupResult {
	finalLives: number
	eliminated: boolean
	pickResults: CupPickResult[]
}

/**
 * Resolve who qualified from a (knockout) tie for cup scoring.
 *
 * The stored `winner` is authoritative when present. But football-data leaves
 * `score.winner` null on some penalty shootouts (it can lag the score by a
 * poll or two), so when the fixture is FINISHED and `winner` is absent we fall
 * back to the full-time score — which folds in the penalty aggregate (e.g. a
 * 1-1 shootout won 3-2 on penalties stores fullTime 4-3), so the higher side is
 * the side that advanced. A still-in-play match never derives a qualifier (its
 * full-time score is just the current live score), and a finished match level
 * on full-time with no winner is genuinely undecidable → null.
 */
export function resolveCupQualifier(opts: {
	winner: 'home' | 'away' | null
	finished: boolean
	fullHomeScore: number | null
	fullAwayScore: number | null
}): 'home' | 'away' | null {
	if (opts.winner != null) return opts.winner
	if (!opts.finished) return null
	const { fullHomeScore: h, fullAwayScore: a } = opts
	if (h == null || a == null || h === a) return null
	return h > a ? 'home' : 'away'
}

export function evaluateCupPicks(picks: CupPickInput[], startingLives: number): CupResult {
	const sorted = [...picks].sort((a, b) => a.confidenceRank - b.confidenceRank)
	let currentLives = startingLives
	let streakBroken = false
	const pickResults: CupPickResult[] = []

	for (const pick of sorted) {
		const tierDiffFromPicked =
			pick.pickedTeam === 'home' ? pick.tierDifference : -pick.tierDifference

		if (tierDiffFromPicked > 1) {
			pickResults.push({
				confidenceRank: pick.confidenceRank,
				result: 'restricted',
				livesGained: 0,
				goalsCounted: 0,
				restricted: true,
			})
			continue
		}

		const pickedTeamGoals = pick.pickedTeam === 'home' ? pick.homeScore : pick.awayScore
		const opponentGoals = pick.pickedTeam === 'home' ? pick.awayScore : pick.homeScore
		// A knockout pick is "to qualify". When the qualification outcome is known
		// (`winner` set) it is authoritative: the picked side qualifying is a WIN
		// (regardless of a level 90-minute score), and a side that did NOT qualify
		// but was level at 90 is floored at a draw (so a handicapped underdog that
		// drew at 90 but lost the shootout still survives). When no winner is decided
		// (group draw, or a match still in play) fall back to the 90-minute score.
		const qualified = pick.winner != null ? pick.winner === pick.pickedTeam : null
		const level90 = pickedTeamGoals === opponentGoals
		const pickedTeamWon = qualified ?? pickedTeamGoals > opponentGoals
		const isDraw = qualified === true ? false : level90

		let result: CupPickResult['result'] = 'loss'
		let livesGained = 0
		let goalsCounted = 0

		if (pickedTeamWon) {
			result = 'win'
			if (tierDiffFromPicked !== 1) {
				goalsCounted = pickedTeamGoals
			}
			// Lives are earned only while the streak is alive. A win after the
			// streak has broken (the player is already eliminated) earns nothing
			// usable — counting it would inflate the lives tiebreaker with lives
			// the player can never spend. Goals still count; only life accrual is
			// frozen at the eliminating pick.
			if (tierDiffFromPicked < 0 && !streakBroken) {
				livesGained = Math.abs(tierDiffFromPicked)
				currentLives += livesGained
			}
		} else if (isDraw) {
			if (tierDiffFromPicked <= -1) {
				result = 'draw_success'
				// Goals NOT counted on draw_success (matches old app stored procedure)
				if (tierDiffFromPicked <= -2 && !streakBroken) {
					livesGained = 1
					currentLives += 1
				}
			} else {
				if (!streakBroken && currentLives > 0) {
					result = 'saved_by_life'
					currentLives--
					goalsCounted = pickedTeamGoals
				} else {
					result = 'loss'
					streakBroken = true
				}
			}
		} else {
			if (!streakBroken && currentLives > 0) {
				result = 'saved_by_life'
				currentLives--
				goalsCounted = pickedTeamGoals
			} else {
				result = 'loss'
				streakBroken = true
			}
		}

		pickResults.push({
			confidenceRank: pick.confidenceRank,
			result,
			livesGained,
			goalsCounted,
			restricted: false,
		})
	}

	return { finalLives: currentLives, eliminated: streakBroken, pickResults }
}
