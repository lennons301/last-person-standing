import { describe, expect, it } from 'vitest'
import type { StandingsShareData } from '../data'
import { classicStandingsLayout } from './classic-standings'

/**
 * The share image must carry the classic tiebreaker (total goals) and the
 * per-cell scoreline, matching the on-site grid + the turbo share image.
 * The layout returns a @vercel/og React element tree (plain objects), so we
 * serialise it and assert the values are present in the rendered output.
 */
function makeData(): Extract<StandingsShareData, { mode: 'classic' }> {
	return {
		mode: 'classic',
		flat: false,
		header: {
			gameName: 'G',
			gameMode: 'classic',
			competitionName: 'World Cup',
			pot: '0.00',
			potTotal: '0.00',
			generatedAt: new Date('2020-05-01T00:00:00Z'),
		},
		classicGrid: {
			aliveCount: 1,
			eliminatedCount: 0,
			pot: '0.00',
			rounds: [{ id: 'r1', number: 4, name: 'Round of 32', label: 'R32' }],
			players: [
				{
					id: 'p1',
					name: 'Zed',
					status: 'alive',
					eliminatedRoundNumber: undefined,
					eliminatedRoundLabel: undefined,
					goals: 42,
					cellsByRoundId: {
						r1: {
							result: 'win',
							teamShortName: 'POR',
							opponentShortName: 'CRO',
							homeAway: 'H',
							score: '2-1',
						},
					},
				},
			],
		},
	} as unknown as Extract<StandingsShareData, { mode: 'classic' }>
}

describe('classicStandingsLayout', () => {
	it('renders a Gls column header', () => {
		const { jsx } = classicStandingsLayout(makeData())
		expect(JSON.stringify(jsx)).toContain('Gls')
	})

	it("renders each player's total goals (the tiebreaker)", () => {
		const { jsx } = classicStandingsLayout(makeData())
		expect(JSON.stringify(jsx)).toContain('42')
	})

	it('renders the per-cell scoreline', () => {
		const { jsx } = classicStandingsLayout(makeData())
		expect(JSON.stringify(jsx)).toContain('2-1')
	})

	it('marks the elimination-round pick with a skull but keeps the pick + result visible', () => {
		const data = makeData()
		// The player was eliminated on this round but their pick actually WON
		// (the Mark Edworthy case). The cell must still show the team and a skull.
		data.classicGrid.players[0].status = 'eliminated'
		data.classicGrid.players[0].cellsByRoundId.r1.eliminatedHere = true
		const s = JSON.stringify(classicStandingsLayout(data).jsx)
		expect(s).toContain('POR') // pick still shown
		expect(s).toContain('💀') // elimination marker
	})
})
