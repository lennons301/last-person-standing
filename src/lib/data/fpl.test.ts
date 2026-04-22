import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FplAdapter } from './fpl'

const mockBootstrap = {
	teams: [
		{ id: 1, name: 'Arsenal', short_name: 'ARS', code: 3 },
		{ id: 2, name: 'Chelsea', short_name: 'CHE', code: 8 },
	],
	events: [
		{ id: 1, name: 'Gameweek 1', deadline_time: '2025-08-16T10:00:00Z', finished: true },
		{ id: 2, name: 'Gameweek 2', deadline_time: '2025-08-23T10:00:00Z', finished: false },
	],
}

const mockFixtures = [
	{
		id: 101,
		event: 1,
		team_h: 1,
		team_a: 2,
		kickoff_time: '2025-08-16T15:00:00Z',
		started: true,
		finished: true,
		finished_provisional: true,
		team_h_score: 2,
		team_a_score: 0,
	},
	{
		id: 102,
		event: 2,
		team_h: 2,
		team_a: 1,
		kickoff_time: '2025-08-23T15:00:00Z',
		started: false,
		finished: false,
		finished_provisional: false,
		team_h_score: null,
		team_a_score: null,
	},
]

describe('FplAdapter', () => {
	let adapter: FplAdapter

	beforeEach(() => {
		adapter = new FplAdapter()
		vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
			const urlStr = typeof url === 'string' ? url : url.toString()
			if (urlStr.includes('bootstrap-static'))
				return Promise.resolve(new Response(JSON.stringify(mockBootstrap)))
			if (urlStr.includes('fixtures'))
				return Promise.resolve(new Response(JSON.stringify(mockFixtures)))
			return Promise.resolve(new Response('Not found', { status: 404 }))
		})
	})

	it('fetches and maps teams', async () => {
		const teams = await adapter.fetchTeams()
		expect(teams).toHaveLength(2)
		expect(teams[0]).toEqual({
			externalId: '1',
			name: 'Arsenal',
			shortName: 'ARS',
			badgeUrl: 'https://resources.premierleague.com/premierleague/badges/rb/t3.svg',
		})
	})

	it('fetches rounds with fixtures', async () => {
		const rounds = await adapter.fetchRounds()
		expect(rounds).toHaveLength(2)
		expect(rounds[0].number).toBe(1)
		expect(rounds[0].finished).toBe(true)
		expect(rounds[0].fixtures).toHaveLength(1)
		expect(rounds[0].fixtures[0].homeScore).toBe(2)
	})

	it('maps fixture status correctly', async () => {
		const rounds = await adapter.fetchRounds()
		expect(rounds[0].fixtures[0].status).toBe('finished')
		expect(rounds[1].fixtures[0].status).toBe('scheduled')
	})
})
