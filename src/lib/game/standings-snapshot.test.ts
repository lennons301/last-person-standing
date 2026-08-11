import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dbInsertFn, dbInsertValues, dbOnConflictDoUpdate } = vi.hoisted(() => {
	const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
	const values = vi.fn((_row: Record<string, unknown>) => ({ onConflictDoUpdate }))
	return {
		dbInsertFn: vi.fn(() => ({ values })),
		dbInsertValues: values,
		dbOnConflictDoUpdate: onConflictDoUpdate,
	}
})

vi.mock('@/lib/db', () => ({ db: { insert: dbInsertFn } }))

import type { AdapterStanding } from '@/lib/data/types'
import { recordStandingsSnapshot } from './standings-snapshot'

const NOW = new Date('2026-08-22T04:00:00Z')

function standing(
	overrides: Partial<AdapterStanding> & { teamExternalId: string },
): AdapterStanding {
	return {
		position: 1,
		played: 2,
		won: 2,
		drawn: 0,
		lost: 0,
		points: 6,
		...overrides,
	}
}

beforeEach(() => {
	dbInsertFn.mockClear()
	dbInsertValues.mockClear()
	dbOnConflictDoUpdate.mockClear()
})

describe('recordStandingsSnapshot', () => {
	it('writes one row per team, keyed on the team’s own played count', async () => {
		const summary = await recordStandingsSnapshot(
			'comp-pl',
			[
				standing({ teamExternalId: '65', position: 1, played: 3, points: 9 }),
				// Postponement: same matchday, one game fewer played. The snapshot
				// records where each team actually is, not a shared round number.
				standing({ teamExternalId: '66', position: 2, played: 2, won: 2, points: 6 }),
			],
			new Map([
				['65', 'team-mci'],
				['66', 'team-mun'],
			]),
			{ now: NOW },
		)

		expect(summary).toEqual({ written: 2, skipped: 0 })
		expect(dbInsertValues.mock.calls.map(([row]) => row)).toEqual([
			{
				competitionId: 'comp-pl',
				teamId: 'team-mci',
				matchday: 3,
				position: 1,
				played: 3,
				won: 2,
				drawn: 0,
				lost: 0,
				points: 9,
				capturedAt: NOW,
			},
			{
				competitionId: 'comp-pl',
				teamId: 'team-mun',
				matchday: 2,
				position: 2,
				played: 2,
				won: 2,
				drawn: 0,
				lost: 0,
				points: 6,
				capturedAt: NOW,
			},
		])
	})

	it('upserts on (competition, team, matchday) so a same-day re-sync refreshes the point', async () => {
		await recordStandingsSnapshot(
			'comp-pl',
			[standing({ teamExternalId: '65' })],
			new Map([['65', 'team-mci']]),
			{
				now: NOW,
			},
		)
		expect(dbOnConflictDoUpdate).toHaveBeenCalledTimes(1)
		const [conflict] = dbOnConflictDoUpdate.mock.calls[0] as [
			{ target: unknown[]; set: Record<string, unknown> },
		]
		expect(conflict.target).toHaveLength(3)
		expect(conflict.set).toMatchObject({ position: 1, matchday: 2 })
	})

	it('skips teams outside the competition being synced', async () => {
		const summary = await recordStandingsSnapshot(
			'comp-pl',
			[standing({ teamExternalId: 'not-ours' })],
			new Map([['65', 'team-mci']]),
			{ now: NOW },
		)
		expect(summary).toEqual({ written: 0, skipped: 1 })
		expect(dbInsertFn).not.toHaveBeenCalled()
	})

	it('skips a team on zero games played — its position is a placeholder, not a data point', async () => {
		const summary = await recordStandingsSnapshot(
			'comp-pl',
			[standing({ teamExternalId: '65', played: 0, won: 0, points: 0 })],
			new Map([['65', 'team-mci']]),
			{ now: NOW },
		)
		expect(summary).toEqual({ written: 0, skipped: 1 })
		expect(dbInsertFn).not.toHaveBeenCalled()
	})
})
