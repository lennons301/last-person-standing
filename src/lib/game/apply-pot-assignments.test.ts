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

import { WC_2026_POTS } from '@/lib/data/wc-pots'
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

	it('THROWS naming the unmatched team(s) when any WC team has no pot', async () => {
		dbMock.query.round.findMany.mockResolvedValue([
			{
				fixtures: [{ homeTeamId: 't-known', awayTeamId: 't-unknown' }],
			},
		] as never)
		dbMock.query.team.findMany.mockResolvedValue([
			{ id: 't-known', name: 'Germany', externalIds: {} },
			{ id: 't-unknown', name: 'Italy', externalIds: {} }, // not in WC_2026_POTS
		] as never)

		// Fail-loud: an untagged WC team blocks cup creation + zeroes tier-diff,
		// so we surface it at sync time rather than warning and limping on.
		await expect(applyPotAssignments('c1')).rejects.toThrow(/Italy/)
	})

	it('resolves football-data canonical names via the alias map', async () => {
		// These are the names football-data is assumed to return that differ from
		// WC_2026_POTS — they must resolve through FD_NAME_TO_WC_POT_NAME, not the
		// direct name match. (Assumed spellings; see TODO(#65) in wc-pots.ts.)
		dbMock.query.round.findMany.mockResolvedValue([
			{
				fixtures: [
					{ homeTeamId: 't-kor', awayTeamId: 't-cze' },
					{ homeTeamId: 't-tur', awayTeamId: 't-cgo' },
				],
			},
		] as never)
		dbMock.query.team.findMany.mockResolvedValue([
			{ id: 't-kor', name: 'Korea Republic', externalIds: {} },
			{ id: 't-cze', name: 'Czech Republic', externalIds: {} },
			{ id: 't-tur', name: 'Türkiye', externalIds: {} },
			{ id: 't-cgo', name: 'DR Congo', externalIds: {} },
		] as never)

		const result = await applyPotAssignments('c1')
		expect(result.matched).toBe(4)
		expect(result.unmatched).toEqual([])
	})

	it('prefers football-data ID over name when WC_2026_POTS is backfilled', async () => {
		// Team name is deliberately wrong; only a backfilled ID can match it.
		// Skips automatically while WC_2026_POTS carries no footballDataId (today).
		const withId = WC_2026_POTS.find((p) => p.footballDataId)
		if (!withId) return
		dbMock.query.round.findMany.mockResolvedValue([
			{ fixtures: [{ homeTeamId: 't', awayTeamId: 't' }] },
		] as never)
		dbMock.query.team.findMany.mockResolvedValue([
			{
				id: 't',
				name: 'Not A Real Country Name',
				externalIds: { football_data: withId.footballDataId },
			},
		] as never)

		const result = await applyPotAssignments('c1')
		expect(result.matched).toBe(1)
		expect(result.unmatched).toEqual([])
	})
})
