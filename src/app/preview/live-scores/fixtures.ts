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
		...overrides,
	}
}

function viewerPick(fixtureId: string, predictedResult: LivePick['predictedResult']): LivePick {
	return {
		gamePlayerId: VIEWER_PLAYER_ID,
		fixtureId,
		teamId: 'team-1',
		confidenceRank: null,
		predictedResult,
		result: null,
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
			note: 'Matches in play, one at half time, some kicked off later, two already done. The control shows the in-play count; the viewer’s pick is badged inside.',
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
				[viewerPick('ars-che', 'home_win')],
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
