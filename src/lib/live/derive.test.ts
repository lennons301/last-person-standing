import { describe, expect, it } from 'vitest'
import { deriveMatchState, projectPickOutcome } from './derive'
import type { LiveFixture, LivePick } from './types'

function fx(overrides: Partial<LiveFixture> = {}): LiveFixture {
	return {
		id: 'fx1',
		kickoff: new Date('2026-06-11T19:00:00Z'),
		homeScore: null,
		awayScore: null,
		status: 'scheduled',
		homeShort: 'ENG',
		awayShort: 'FRA',
		homeTeamId: 't-home',
		awayTeamId: 't-away',
		winner: null,
		knockout: false,
		...overrides,
	}
}

describe('deriveMatchState', () => {
	it('returns pre when kickoff is more than 10 minutes away', () => {
		const now = new Date('2026-06-11T18:49:00Z')
		expect(deriveMatchState(fx(), now)).toBe('pre')
	})

	it('returns live when kickoff is within 10m before and status is scheduled', () => {
		const now = new Date('2026-06-11T18:55:00Z')
		expect(deriveMatchState(fx(), now)).toBe('live')
	})

	it('returns live when status is live', () => {
		const now = new Date('2026-06-11T19:30:00Z')
		expect(deriveMatchState(fx({ status: 'live' }), now)).toBe('live')
	})

	it('returns ht when status is halftime', () => {
		const now = new Date('2026-06-11T19:45:00Z')
		expect(deriveMatchState(fx({ status: 'halftime' }), now)).toBe('ht')
	})

	it('returns ft when status is finished', () => {
		const now = new Date('2026-06-11T21:30:00Z')
		expect(deriveMatchState(fx({ status: 'finished' }), now)).toBe('ft')
	})

	it('returns ft when kickoff is more than 2.5h ago regardless of status', () => {
		const now = new Date('2026-06-11T22:00:00Z')
		expect(deriveMatchState(fx(), now)).toBe('ft')
	})

	it('returns pre when kickoff is null', () => {
		expect(deriveMatchState(fx({ kickoff: null }), new Date())).toBe('pre')
	})
})

describe('projectPickOutcome', () => {
	const homeWin: LivePick = {
		gamePlayerId: 'gp1',
		fixtureId: 'fx1',
		teamId: 't-home',
		confidenceRank: 1,
		predictedResult: 'home_win',
		result: null,
		preMatchWinProbability: null,
	}

	it('returns winning when home pick and home leads', () => {
		expect(
			projectPickOutcome(homeWin, fx({ homeScore: 1, awayScore: 0, status: 'live' }), 'classic'),
		).toBe('winning')
	})

	it('returns losing when home pick and away leads', () => {
		expect(
			projectPickOutcome(homeWin, fx({ homeScore: 0, awayScore: 1, status: 'live' }), 'classic'),
		).toBe('losing')
	})

	it('returns drawing when scores level during live match', () => {
		expect(
			projectPickOutcome(homeWin, fx({ homeScore: 1, awayScore: 1, status: 'live' }), 'classic'),
		).toBe('drawing')
	})

	it('returns settled-win when status finished and home wins', () => {
		expect(
			projectPickOutcome(
				homeWin,
				fx({ homeScore: 2, awayScore: 1, status: 'finished' }),
				'classic',
			),
		).toBe('settled-win')
	})

	it('returns settled-loss when status finished and home loses', () => {
		expect(
			projectPickOutcome(
				homeWin,
				fx({ homeScore: 0, awayScore: 1, status: 'finished' }),
				'classic',
			),
		).toBe('settled-loss')
	})

	it('returns saved-by-life when pick result is saved_by_life', () => {
		expect(
			projectPickOutcome(
				{ ...homeWin, result: 'saved_by_life' },
				fx({ status: 'finished' }),
				'cup',
			),
		).toBe('saved-by-life')
	})

	it('returns winning for away pick when away leads', () => {
		const awayWin: LivePick = { ...homeWin, teamId: 't-away', predictedResult: 'away_win' }
		expect(
			projectPickOutcome(awayWin, fx({ homeScore: 0, awayScore: 1, status: 'live' }), 'classic'),
		).toBe('winning')
	})

	it('projects a penalty-decided tie as a win, the same as settlement scores it', () => {
		// The #242 divergence: level on score, `winner` populated. Settlement read
		// the winner and scored a win; the projection read the score alone and
		// showed the backer a loss (and, on the grid, an elimination).
		const tie = fx({
			homeScore: 1,
			awayScore: 1,
			status: 'finished',
			winner: 'home',
			knockout: true,
		})
		expect(projectPickOutcome(homeWin, tie, 'classic')).toBe('settled-win')
	})

	it('leaves an unresolved knockout tie pending rather than calling it a loss', () => {
		// #107's deferral, on the projection side: level with no winner reported is
		// winner-lag, and nothing may be shown as settled until it resolves.
		const unresolved = fx({ homeScore: 1, awayScore: 1, status: 'finished', knockout: true })
		expect(projectPickOutcome(homeWin, unresolved, 'classic')).toBe('pending')
	})
})
