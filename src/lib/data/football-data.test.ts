import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FootballDataAdapter } from './football-data'

const mockMatches = {
	matches: [
		{
			id: 501,
			matchday: 1,
			homeTeam: {
				id: 57,
				name: 'Arsenal',
				tla: 'ARS',
				crest: 'https://crests.football-data.org/57.png',
			},
			awayTeam: {
				id: 61,
				name: 'Chelsea',
				tla: 'CHE',
				crest: 'https://crests.football-data.org/61.png',
			},
			utcDate: '2025-08-16T15:00:00Z',
			status: 'FINISHED',
			score: { fullTime: { home: 2, away: 0 } },
		},
		{
			id: 502,
			matchday: 1,
			homeTeam: {
				id: 64,
				name: 'Liverpool',
				tla: 'LIV',
				crest: 'https://crests.football-data.org/64.png',
			},
			awayTeam: {
				id: 66,
				name: 'Man United',
				tla: 'MUN',
				crest: 'https://crests.football-data.org/66.png',
			},
			utcDate: '2025-08-16T17:30:00Z',
			status: 'IN_PLAY',
			score: { fullTime: { home: 1, away: 1 } },
		},
	],
}

const mockStandings = {
	standings: [
		{
			type: 'TOTAL',
			table: [
				{ position: 1, team: { id: 57 }, playedGames: 10, won: 8, draw: 1, lost: 1, points: 25 },
				{ position: 2, team: { id: 61 }, playedGames: 10, won: 7, draw: 2, lost: 1, points: 23 },
			],
		},
	],
}

describe('FootballDataAdapter', () => {
	let adapter: FootballDataAdapter

	beforeEach(() => {
		adapter = new FootballDataAdapter('PL', 'test-api-key')
		vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
			const urlStr = typeof url === 'string' ? url : url.toString()
			if (urlStr.includes('/matches'))
				return Promise.resolve(new Response(JSON.stringify(mockMatches)))
			if (urlStr.includes('/standings'))
				return Promise.resolve(new Response(JSON.stringify(mockStandings)))
			return Promise.resolve(new Response('Not found', { status: 404 }))
		})
	})

	it('fetches teams from matches', async () => {
		const teams = await adapter.fetchTeams()
		expect(teams.length).toBeGreaterThanOrEqual(2)
		expect(teams.find((t) => t.shortName === 'ARS')).toEqual({
			externalId: '57',
			name: 'Arsenal',
			shortName: 'ARS',
			badgeUrl: 'https://crests.football-data.org/57.png',
		})
	})

	it('fetches rounds grouped by matchday', async () => {
		const rounds = await adapter.fetchRounds()
		expect(rounds).toHaveLength(1)
		expect(rounds[0].number).toBe(1)
		expect(rounds[0].fixtures).toHaveLength(2)
	})

	it('maps status correctly', async () => {
		const rounds = await adapter.fetchRounds()
		expect(rounds[0].fixtures[0].status).toBe('finished')
		expect(rounds[0].fixtures[1].status).toBe('live')
	})

	it('fetches live scores', async () => {
		const scores = await adapter.fetchLiveScores(1)
		expect(scores).toHaveLength(2)
		expect(scores[0]).toEqual({ externalId: '501', homeScore: 2, awayScore: 0, status: 'finished' })
	})

	it('sends API key in headers', async () => {
		await adapter.fetchTeams()
		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				headers: expect.objectContaining({ 'X-Auth-Token': 'test-api-key' }),
			}),
		)
	})

	it('skips matches with placeholder (null) teams in fetchTeams', async () => {
		const placeholderMatches = {
			matches: [
				...mockMatches.matches,
				{
					id: 999,
					matchday: 4,
					homeTeam: { id: null, name: null, tla: null, crest: null },
					awayTeam: { id: null, name: null, tla: null, crest: null },
					utcDate: '2026-07-15T15:00:00Z',
					status: 'SCHEDULED',
					score: { fullTime: { home: null, away: null } },
				},
			],
		}
		vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
			Promise.resolve(new Response(JSON.stringify(placeholderMatches))),
		)
		const teams = await adapter.fetchTeams()
		expect(teams.every((t) => t.name && t.externalId !== 'null')).toBe(true)
		expect(teams.find((t) => t.externalId === 'null')).toBeUndefined()
	})

	it('skips matches with null matchday in fetchRounds', async () => {
		const withKnockouts = {
			matches: [
				...mockMatches.matches,
				{
					id: 998,
					matchday: null,
					homeTeam: { id: 64, name: 'Liverpool', tla: 'LIV', crest: '' },
					awayTeam: { id: 66, name: 'Man United', tla: 'MUN', crest: '' },
					utcDate: '2026-07-15T15:00:00Z',
					status: 'TIMED',
					score: { fullTime: { home: null, away: null } },
				},
			],
		}
		vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
			Promise.resolve(new Response(JSON.stringify(withKnockouts))),
		)
		const rounds = await adapter.fetchRounds()
		expect(rounds.every((r) => r.number != null)).toBe(true)
		expect(rounds.find((r) => r.name === 'Matchday null')).toBeUndefined()
		const allFixtures = rounds.flatMap((r) => r.fixtures)
		expect(allFixtures.find((f) => f.externalId === '998')).toBeUndefined()
	})

	it('skips fixtures with placeholder teams in fetchRounds', async () => {
		const placeholderMatches = {
			matches: [
				...mockMatches.matches,
				{
					id: 999,
					matchday: 1,
					homeTeam: { id: null, name: null, tla: null, crest: null },
					awayTeam: { id: 64, name: 'Liverpool', tla: 'LIV', crest: '' },
					utcDate: '2026-07-15T15:00:00Z',
					status: 'SCHEDULED',
					score: { fullTime: { home: null, away: null } },
				},
			],
		}
		vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
			Promise.resolve(new Response(JSON.stringify(placeholderMatches))),
		)
		const rounds = await adapter.fetchRounds()
		const allFixtures = rounds.flatMap((r) => r.fixtures)
		expect(allFixtures.find((f) => f.externalId === '999')).toBeUndefined()
		expect(allFixtures.every((f) => f.homeTeamExternalId !== 'null')).toBe(true)
	})

	it('fetches standings', async () => {
		const standings = await adapter.fetchStandings()
		expect(standings).toHaveLength(2)
		expect(standings[0]).toEqual({
			teamExternalId: '57',
			position: 1,
			played: 10,
			won: 8,
			drawn: 1,
			lost: 1,
			points: 25,
		})
	})
})
