// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { type PlannerFixture, PlannerRound } from './planner-round'

afterEach(cleanup)

const FIXTURE: PlannerFixture = {
	id: 'fx-1',
	kickoff: new Date('2099-01-01T12:00:00Z'),
	homeTeam: {
		id: 't-mun',
		short: 'MUN',
		name: 'Manchester United',
		colour: null,
		badgeUrl: null,
		form: ['W', 'W', 'D'],
		leaguePosition: 4,
	},
	awayTeam: {
		id: 't-new',
		short: 'NEW',
		name: 'Newcastle United',
		colour: null,
		badgeUrl: null,
		form: ['L', 'D'],
		leaguePosition: 9,
	},
}

function renderRound(overrides: Partial<React.ComponentProps<typeof PlannerRound>> = {}) {
	return render(
		<PlannerRound
			roundId="r27"
			roundNumber={27}
			roundName="Gameweek 27"
			roundLabel="GW27"
			deadline={new Date('2099-01-01T10:00:00Z')}
			fixturesTbc={false}
			fixtures={[FIXTURE]}
			usedTeams={[]}
			lockedTeamId={null}
			onLock={async () => {}}
			{...overrides}
		/>,
	)
}

describe('PlannerRound — parity with the current-round picker', () => {
	it('shows form and league position on a future round', () => {
		// The planner used to pass neither, so a future pick was decided with less
		// information than the same team's current-round row offered.
		renderRound()
		expect(screen.getByText('4th')).toBeTruthy()
		expect(screen.getByText('9th')).toBeTruthy()
		expect(screen.getAllByText('W')).toHaveLength(2)
		expect(screen.getAllByText('D')).toHaveLength(2)
	})

	it('taps through to the form sheet when a competition is supplied', () => {
		renderRound({ competitionId: 'c1' })
		expect(screen.getByLabelText('Open form details for Manchester United')).toBeTruthy()
		expect(screen.getByLabelText('Open form details for Newcastle United')).toBeTruthy()
	})

	it('keeps positions on a form-less round, and adds no filler beside them', () => {
		// Season start: no results anywhere. The positions are what the bar is for,
		// and they read as an unplayed season without being told so.
		const { container } = renderRound({
			fixtures: [
				{
					...FIXTURE,
					homeTeam: { ...FIXTURE.homeTeam, form: undefined },
					awayTeam: { ...FIXTURE.awayTeam, form: undefined },
				},
			],
		})
		expect(screen.getByText('4th')).toBeTruthy()
		expect(container.textContent).not.toContain('No form yet')
	})
})
