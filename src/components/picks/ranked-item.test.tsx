// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RankedPick } from './ranked-item'
import { RankingList } from './ranking-list'

afterEach(cleanup)

const PICK: RankedPick = {
	id: 'f1',
	rank: 1,
	fixtureId: 'f1',
	homeTeam: { id: 't1', name: 'Manchester United', shortName: 'MUN' },
	awayTeam: { id: 't2', name: 'Newcastle United', shortName: 'NEW' },
	prediction: 'home_win',
}

function noop() {}

function renderList(props: Partial<React.ComponentProps<typeof RankingList>> = {}) {
	return render(
		<RankingList
			picks={[PICK]}
			onReorder={noop}
			onRemove={noop}
			onChangePrediction={noop}
			{...props}
		/>,
	)
}

describe('RankedItem form tap-through', () => {
	it('makes both teams open the form sheet for their own side', () => {
		// Ranking a fixture used to strip its form away entirely: the row dropped to
		// a badge and a prediction, so a committed pick could only be re-examined by
		// un-ranking it first.
		const opened: Array<{ side: string; open: boolean }> = []
		renderList({
			renderFormSheet:
				() =>
				({ side, open }) => {
					opened.push({ side, open })
					return null
				},
		})

		fireEvent.click(screen.getByLabelText('Open form details for Newcastle United'))
		expect(opened.at(-1)).toEqual({ side: 'away', open: true })

		fireEvent.click(screen.getByLabelText('Open form details for Manchester United'))
		expect(opened.at(-1)).toEqual({ side: 'home', open: true })
	})

	it('leaves team names as plain text when no sheet is available', () => {
		// No competitionId and no renderFormSheet: nothing to tap through to, so the
		// row must not advertise an affordance it can't honour.
		renderList()
		expect(screen.queryByLabelText(/Open form details/)).toBeNull()
		expect(screen.getByText('Manchester United')).toBeTruthy()
	})

	it('keeps the reorder, prediction and remove controls alongside it', () => {
		renderList({ competitionId: 'c1', roundNumber: 3 })
		expect(screen.getByLabelText('Drag to reorder')).toBeTruthy()
		expect(screen.getByLabelText('Move up')).toBeTruthy()
		expect(screen.getByLabelText('Move down')).toBeTruthy()
		expect(screen.getByLabelText('Remove')).toBeTruthy()
		expect(screen.getByLabelText('Change prediction (currently Home)')).toBeTruthy()
	})
})
