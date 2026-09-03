import type { LiveFixture, LivePayload, LivePick } from '@/lib/live/types'

/**
 * Hand-built live payloads for the live-scores gallery — one per scenario the
 * pop-out has to handle, including the ones a real database only produces
 * during an actual match window (the whole reason this gallery exists).
 */
export interface LiveScoresFixture {
	id: string
	title: string
	note?: string
	payload: LivePayload
}

const VIEWER_USER_ID = 'viewer'
const VIEWER_PLAYER_ID = 'viewer-player'

function mins(now: Date, n: number): string {
	return new Date(now.getTime() + n * 60_000).toISOString()
}

function match(overrides: Partial<LiveFixture> & { id: string }): LiveFixture {
	return {
		kickoff: null,
		homeScore: null,
		awayScore: null,
		status: 'scheduled',
		homeShort: 'HOM',
		awayShort: 'AWY',
		homeTeamId: 't-home',
		awayTeamId: 't-away',
		winner: null,
		knockout: false,
		...overrides,
	}
}

/** A second player row for the same viewer — what a rebuy leaves behind. */
const VIEWER_REBUY_PLAYER_ID = 'viewer-player-rebuy'

function viewerPick(
	fixtureId: string,
	predictedResult: LivePick['predictedResult'],
	overrides: Partial<LivePick> = {},
): LivePick {
	return {
		gamePlayerId: VIEWER_PLAYER_ID,
		fixtureId,
		teamId: 'team-1',
		confidenceRank: null,
		predictedResult,
		result: null,
		preMatchWinProbability: null,
		...overrides,
	}
}

function payload(fixtures: LiveFixture[], picks: LivePick[] = []): LivePayload {
	return {
		gameId: 'preview-game',
		gameMode: 'classic',
		roundId: 'preview-round',
		fixtures,
		picks,
		players: [
			{ id: VIEWER_PLAYER_ID, userId: VIEWER_USER_ID, status: 'active', livesRemaining: 0 },
			// The rebuy row is the viewer's too, so a payload can carry two of their
			// picks in one round — which is how the gallery shows a priced pick and an
			// unpriced one side by side.
			{ id: VIEWER_REBUY_PLAYER_ID, userId: VIEWER_USER_ID, status: 'active', livesRemaining: 0 },
			{ id: 'other-player', userId: 'someone-else', status: 'active', livesRemaining: 0 },
		],
		viewerUserId: VIEWER_USER_ID,
		updatedAt: new Date(0).toISOString(),
	}
}

/**
 * `now` is an argument for the same reason the game-hero fixtures take one:
 * match states are derived relative to it, and the gallery should never reach
 * for a wall clock halfway down a fixture list.
 */
export function buildLiveScoresFixtures(now: Date): LiveScoresFixture[] {
	return [
		{
			id: 'saturday-afternoon',
			title: 'Live window · Saturday 3pm',
			note: 'Matches in play, one at half time, some kicked off later, two already done. The control shows the in-play count; the viewer’s pick is badged inside, with the pre-match chance it went in at.',
			payload: payload(
				[
					match({
						id: 'ars-che',
						status: 'live',
						kickoff: mins(now, -37),
						homeScore: 2,
						awayScore: 1,
						homeShort: 'ARS',
						awayShort: 'CHE',
					}),
					match({
						id: 'liv-eve',
						status: 'halftime',
						kickoff: mins(now, -50),
						homeScore: 0,
						awayScore: 0,
						homeShort: 'LIV',
						awayShort: 'EVE',
					}),
					match({
						id: 'new-tot',
						status: 'live',
						kickoff: mins(now, -12),
						homeScore: 0,
						awayScore: 1,
						homeShort: 'NEW',
						awayShort: 'TOT',
					}),
					match({
						id: 'bha-wol',
						kickoff: mins(now, 135),
						homeShort: 'BHA',
						awayShort: 'WOL',
					}),
					match({
						id: 'ful-bre',
						kickoff: mins(now, 26 * 60),
						homeShort: 'FUL',
						awayShort: 'BRE',
					}),
					match({
						id: 'mci-bur',
						status: 'finished',
						kickoff: mins(now, -24 * 60),
						homeScore: 3,
						awayScore: 0,
						homeShort: 'MCI',
						awayShort: 'BUR',
					}),
					match({
						id: 'avl-cry',
						status: 'finished',
						kickoff: mins(now, -48 * 60),
						homeScore: 1,
						awayScore: 1,
						homeShort: 'AVL',
						awayShort: 'CRY',
					}),
				],
				[viewerPick('ars-che', 'home_win', { preMatchWinProbability: 0.5175 })],
			),
		},
		{
			id: 'kickoff-imminent',
			title: 'Live window · kickoff imminent',
			note: 'Nothing has kicked off yet, but the first match is inside the live window — the control is already there.',
			payload: payload(
				[
					match({ id: 'lee-sou', kickoff: mins(now, 6), homeShort: 'LEE', awayShort: 'SOU' }),
					match({ id: 'not-bou', kickoff: mins(now, 180), homeShort: 'NOT', awayShort: 'BOU' }),
				],
				[viewerPick('lee-sou', 'away_win')],
			),
		},
		{
			id: 'single-match',
			title: 'Live window · one match in play',
			note: 'Singular wording on the control ("1 match in play").',
			payload: payload(
				[
					match({
						id: 'whu-bre',
						status: 'live',
						kickoff: mins(now, -70),
						homeScore: 1,
						awayScore: 3,
						homeShort: 'WHU',
						awayShort: 'BRE',
					}),
					match({
						id: 'sun-lee',
						status: 'finished',
						kickoff: mins(now, -26 * 60),
						homeScore: 2,
						awayScore: 2,
						homeShort: 'SUN',
						awayShort: 'LEE',
					}),
				],
				[viewerPick('whu-bre', 'away_win')],
			),
		},
		{
			id: 'pre-match-prices',
			title: 'Live window · pre-match win chances',
			note: 'The figure a scoreline turns into a story: the 22% shot leading away from home, and the 84% favourite being held to a draw. Both are the prices the daily sync froze at the deadline, so both are labelled pre-match — never a live price. Two picks because the viewer rebought.',
			payload: payload(
				[
					match({
						id: 'bre-mun',
						status: 'live',
						kickoff: mins(now, -63),
						homeScore: 0,
						awayScore: 1,
						homeShort: 'MUN',
						awayShort: 'BRE',
					}),
					match({
						id: 'mci-lut',
						status: 'live',
						kickoff: mins(now, -63),
						homeScore: 0,
						awayScore: 0,
						homeShort: 'MCI',
						awayShort: 'LUT',
					}),
					match({
						id: 'bou-cry',
						kickoff: mins(now, 120),
						homeShort: 'BOU',
						awayShort: 'CRY',
					}),
				],
				[
					viewerPick('bre-mun', 'away_win', { preMatchWinProbability: 0.2249 }),
					viewerPick('mci-lut', 'home_win', {
						gamePlayerId: VIEWER_REBUY_PLAYER_ID,
						preMatchWinProbability: 0.8351,
					}),
				],
			),
		},
		{
			id: 'unpriced-competition',
			title: 'Live window · a competition with no prices',
			note: 'A World Cup round: the odds source covers none of it, so no fixture carries a market and the badged pick renders no figure at all. The only "off" state there is — data-driven, and free.',
			payload: payload(
				[
					match({
						id: 'eng-usa',
						status: 'live',
						kickoff: mins(now, -28),
						homeScore: 1,
						awayScore: 1,
						homeShort: 'ENG',
						awayShort: 'USA',
					}),
					match({
						id: 'bra-kor',
						kickoff: mins(now, 200),
						homeShort: 'BRA',
						awayShort: 'KOR',
					}),
				],
				[viewerPick('eng-usa', 'home_win', { preMatchWinProbability: null })],
			),
		},
		{
			id: 'mixed-prices',
			title: 'Live window · a round with prices on some fixtures',
			note: 'One pick on a fixture we hold a market for and one on a fixture we don’t — the second says nothing rather than nought. The gap is the point: an absent price never renders as 0%.',
			payload: payload(
				[
					match({
						id: 'ars-ful',
						status: 'live',
						kickoff: mins(now, -41),
						homeScore: 2,
						awayScore: 0,
						homeShort: 'ARS',
						awayShort: 'FUL',
					}),
					match({
						id: 'eve-whu',
						status: 'live',
						kickoff: mins(now, -41),
						homeScore: 1,
						awayScore: 2,
						homeShort: 'EVE',
						awayShort: 'WHU',
					}),
				],
				[
					viewerPick('ars-ful', 'home_win', { preMatchWinProbability: 0.6112 }),
					viewerPick('eve-whu', 'away_win', {
						gamePlayerId: VIEWER_REBUY_PLAYER_ID,
						preMatchWinProbability: null,
					}),
				],
			),
		},
		{
			id: 'no-live-action',
			title: 'No live action',
			note: 'Round settled, next one days away — no control renders at all. This is the calm page the ticket is after.',
			payload: payload([
				match({
					id: 'ars-mci',
					status: 'finished',
					kickoff: mins(now, -72 * 60),
					homeScore: 1,
					awayScore: 2,
					homeShort: 'ARS',
					awayShort: 'MCI',
				}),
				match({
					id: 'che-liv',
					kickoff: mins(now, 4 * 24 * 60),
					homeShort: 'CHE',
					awayShort: 'LIV',
				}),
			]),
		},
	]
}
