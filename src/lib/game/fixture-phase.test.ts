import { describe, expect, it } from 'vitest'
import { describeFixturePhase } from './fixture-phase'

describe('describeFixturePhase', () => {
	it('reads an unstarted fixture as pre-match', () => {
		expect(describeFixturePhase('scheduled')).toEqual({
			phase: 'pre_match',
			statusLabel: 'Kicks off',
		})
	})

	it('reads a postponed fixture as pre-match too — it just has not happened yet', () => {
		expect(describeFixturePhase('postponed')).toEqual({
			phase: 'pre_match',
			statusLabel: 'Postponed',
		})
	})

	it('reads a live fixture as result — there is a scoreline to show', () => {
		expect(describeFixturePhase('live')).toEqual({ phase: 'result', statusLabel: 'Live' })
	})

	it('reads a finished fixture as result', () => {
		expect(describeFixturePhase('finished')).toEqual({ phase: 'result', statusLabel: 'Full-time' })
	})

	it('reads a cancelled fixture as result — nothing pre-match left to show', () => {
		expect(describeFixturePhase('cancelled')).toEqual({
			phase: 'result',
			statusLabel: 'Cancelled',
		})
	})
})
