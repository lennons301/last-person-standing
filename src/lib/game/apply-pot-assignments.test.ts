import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		query: {
			round: { findMany: vi.fn() },
			team: { findMany: vi.fn() },
		},
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
		})),
	},
}))
vi.mock('@/lib/db', () => ({ db: dbMock }))

import { applyPotAssignments } from './bootstrap-competitions'

describe('applyPotAssignments', () => {
	beforeEach(() => vi.clearAllMocks())

	it('returns matched=0, unmatched=[] when no fixtures/teams in competition', async () => {
		dbMock.query.round.findMany.mockResolvedValue([] as never)
		const result = await applyPotAssignments('c1')
		expect(result).toEqual({ matched: 0, unmatched: [] })
	})

	it('matches teams by name when WC_2026_POTS footballDataId is empty (current state)', async () => {
		dbMock.query.round.findMany.mockResolvedValue([
			{
				fixtures: [{ homeTeamId: 't-spain', awayTeamId: 't-brazil' }],
			},
		] as never)
		dbMock.query.team.findMany.mockResolvedValue([
			{ id: 't-spain', name: 'Spain', externalIds: { football_data: 999 } },
			{ id: 't-brazil', name: 'Brazil', externalIds: { football_data: 998 } },
		] as never)

		const result = await applyPotAssignments('c1')
		expect(result.matched).toBe(2)
		expect(result.unmatched).toEqual([])
	})

	it('case-insensitive name matching', async () => {
		dbMock.query.round.findMany.mockResolvedValue([
			{ fixtures: [{ homeTeamId: 't', awayTeamId: 't' }] },
		] as never)
		dbMock.query.team.findMany.mockResolvedValue([
			{ id: 't', name: 'PORTUGAL', externalIds: {} },
		] as never)

		const result = await applyPotAssignments('c1')
		expect(result.matched).toBe(1)
		expect(result.unmatched).toEqual([])
	})

	it('reports unmatched teams (e.g. unfilled playoff winner)', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		dbMock.query.round.findMany.mockResolvedValue([
			{
				fixtures: [{ homeTeamId: 't-known', awayTeamId: 't-unknown' }],
			},
		] as never)
		dbMock.query.team.findMany.mockResolvedValue([
			{ id: 't-known', name: 'Germany', externalIds: {} },
			{ id: 't-unknown', name: 'Italy', externalIds: {} }, // not in WC_2026_POTS
		] as never)

		const result = await applyPotAssignments('c1')
		expect(result.matched).toBe(1)
		expect(result.unmatched).toEqual(['Italy'])
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('not in WC_2026_POTS'),
			expect.stringContaining('Italy'),
		)
		warn.mockRestore()
	})
})
