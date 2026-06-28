// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Outcome, WinScenarios } from '@/lib/game-logic/win-scenarios'
import { ScenariosView } from './scenarios-view'

const names: Record<string, string> = { p1: 'Alice', p2: 'Bob', p3: 'Cara' }
const playerName = (id: string) => names[id] ?? id
const fixtureLabel = (id: string) => (id === 'f2' ? 'GHA v CRO' : id)
const describeOutcome = (id: string, o: Outcome) =>
	id === 'f2' ? (o === 'home_win' ? 'GHA win' : o === 'away_win' ? 'CRO win' : 'GHA v CRO draw') : o

const scenarios: WinScenarios = {
	outlooks: [
		{
			gamePlayerId: 'p1',
			floor: 1,
			ceiling: 2,
			verdict: 'in_contention',
			pivotalPicks: [{ rank: 2, fixtureId: 'f2' }],
		},
		{
			gamePlayerId: 'p2',
			floor: 1,
			ceiling: 2,
			verdict: 'in_contention',
			pivotalPicks: [{ rank: 2, fixtureId: 'f2' }],
		},
		{ gamePlayerId: 'p3', floor: 0, ceiling: 0, verdict: 'out', pivotalPicks: [] },
	],
	table: [
		{ conditions: [{ fixtureId: 'f2', outcome: 'home_win' }], winners: ['p1'], tieOnGoals: false },
		{ conditions: [{ fixtureId: 'f2', outcome: 'away_win' }], winners: ['p2'], tieOnGoals: false },
		{ conditions: [{ fixtureId: 'f2', outcome: 'draw' }], winners: ['p1', 'p2'], tieOnGoals: true },
	],
	pivotalFixtureIds: ['f2'],
	tooManyToEnumerate: false,
}

describe('ScenariosView', () => {
	it('renders per-player verdicts and the pivotal fixture', () => {
		render(
			<ScenariosView
				scenarios={scenarios}
				playerName={playerName}
				fixtureLabel={fixtureLabel}
				describeOutcome={describeOutcome}
			/>,
		)
		expect(screen.getByText('Alice')).toBeTruthy()
		expect(screen.getByText('Cara')).toBeTruthy()
		expect(screen.getAllByText('In contention').length).toBe(2)
		expect(screen.getByText("Can't win")).toBeTruthy()
		// the pivotal fixture is surfaced for in-contention players
		expect(screen.getAllByText('GHA v CRO').length).toBeGreaterThan(0)
	})

	it('renders the decision table with outcomes → winners', () => {
		render(
			<ScenariosView
				scenarios={scenarios}
				playerName={playerName}
				fixtureLabel={fixtureLabel}
				describeOutcome={describeOutcome}
			/>,
		)
		expect(screen.getByText('GHA win')).toBeTruthy()
		expect(screen.getByText('CRO win')).toBeTruthy()
		expect(screen.getByText(/Alice wins/)).toBeTruthy()
		expect(screen.getByText(/Bob wins/)).toBeTruthy()
		expect(screen.getByText(/Alice & Bob tie \(goals decide\)/)).toBeTruthy()
	})

	it('shows the early-game note when too many results remain', () => {
		render(
			<ScenariosView
				scenarios={{ ...scenarios, table: null, tooManyToEnumerate: true }}
				playerName={playerName}
				fixtureLabel={fixtureLabel}
				describeOutcome={describeOutcome}
			/>,
		)
		expect(screen.getByText(/Too many results still to play/)).toBeTruthy()
	})
})
