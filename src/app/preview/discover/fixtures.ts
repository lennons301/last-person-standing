import {
	buildDiscoverView,
	type DiscoverGameRow,
	type DiscoverView,
} from '@/lib/game/discover-view'

/**
 * The candidate games the discovery gallery renders — hand-written as the rows
 * the home page's query returns, and run through the real `buildDiscoverView`.
 *
 * Hand-built (no database) but never hand-*sorted* and never hand-split: what is
 * worth reviewing here is which games reach the page at all and in what order,
 * and a hand-assembled `DiscoverView` could assert either without it being true.
 * The list deliberately includes the three kinds of game that must never appear
 * — a private one, one the viewer is already in, and a completed one — so the
 * gallery shows them being dropped rather than merely omitting them.
 *
 * `now` is an argument for the same reason the builder takes one: whether a game
 * is open or already under way is read against it, and a fixture list should
 * never reach for a wall clock.
 */

function hours(now: Date, n: number): Date {
	return new Date(now.getTime() + n * 60 * 60 * 1000)
}

function row(overrides: Partial<DiscoverGameRow> & { id: string; name: string }): DiscoverGameRow {
	return {
		inviteCode: 'ABC123',
		gameMode: 'classic',
		status: 'active',
		visibility: 'public',
		competitionName: 'Premier League 2026/27',
		competitionType: 'league',
		playerCount: 6,
		maxPlayers: null,
		entryFee: '10.00',
		currentRoundId: 'round-open',
		startingRoundId: 'round-open',
		startingRound: null,
		viewerIsMember: false,
		...overrides,
	}
}

export function buildDiscoverFixtures(now: Date): DiscoverView {
	const openRound = (number: number, deadline: Date | null) => ({
		id: 'round-open',
		number,
		deadline,
	})

	const games: DiscoverGameRow[] = [
		// --- Open to join ---
		row({
			id: 'game-office',
			name: 'The Office Survivor',
			inviteCode: 'OFFICE',
			playerCount: 11,
			maxPlayers: 20,
			entryFee: '10.00',
			startingRound: openRound(3, hours(now, 30)),
		}),
		row({
			id: 'game-sunday',
			name: 'Sunday League Turbo',
			inviteCode: 'SUNDAY',
			gameMode: 'turbo',
			playerCount: 4,
			entryFee: null,
			startingRound: openRound(3, hours(now, 6)),
		}),
		row({
			id: 'game-worldcup',
			name: 'World Cup Knockout Cup',
			inviteCode: 'WCUP26',
			gameMode: 'cup',
			competitionName: 'World Cup 2026',
			competitionType: 'group_knockout',
			playerCount: 1,
			maxPlayers: 16,
			entryFee: '5.00',
			// Pre-draw knockout rounds carry TBD fixtures and no deadline: open, with
			// no start time to state.
			startingRound: openRound(4, null),
		}),

		// --- Already under way ---
		row({
			id: 'game-pub',
			name: 'The Red Lion',
			playerCount: 24,
			entryFee: '20.00',
			startingRound: openRound(1, hours(now, -22)),
		}),
		row({
			id: 'game-family',
			name: 'Family Sweepstake',
			gameMode: 'turbo',
			playerCount: 9,
			entryFee: null,
			// Advanced past its opening round — started, whatever the current round's
			// deadline says.
			currentRoundId: 'round-4',
			startingRound: openRound(1, hours(now, -400)),
		}),

		// --- Never listed, in either section ---
		row({
			id: 'game-private',
			name: 'Private: reachable by link only',
			visibility: 'private',
			startingRound: openRound(3, hours(now, 12)),
		}),
		row({
			id: 'game-mine',
			name: 'Already in this one',
			viewerIsMember: true,
			startingRound: openRound(3, hours(now, 12)),
		}),
		row({
			id: 'game-finished',
			name: 'Somebody else’s finished game',
			status: 'completed',
			startingRound: openRound(1, hours(now, -900)),
		}),
	]

	return buildDiscoverView({ games, now })
}
