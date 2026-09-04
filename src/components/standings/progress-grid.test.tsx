// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GridCell, GridPlayer, GridRound } from '@/lib/game/read/standings'
import { type GridCellFormSheetRenderer, ProgressGrid } from './progress-grid'

afterEach(cleanup)

vi.mock('@/components/live/use-live-game', () => ({
	useLiveGame: () => ({
		payload: null,
		events: { goals: [], settlements: [] },
		isStale: false,
		reconnecting: false,
	}),
}))

const ROUND: GridRound = {
	id: 'r1',
	number: 12,
	name: 'Gameweek 12',
	label: 'GW12',
	picksLocked: true,
}

function player(cell: GridCell): GridPlayer {
	return {
		id: 'p1',
		userId: 'u1',
		name: 'Alice',
		status: 'alive',
		goals: 0,
		cellsByRoundId: { r1: cell },
	}
}

describe('ProgressGrid — tapping a pick cell', () => {
	it('opens the sheet with pre-match fixture details for a fixture that has not kicked off', () => {
		const renderFormSheet = vi.fn<GridCellFormSheetRenderer>(() => null)
		const cell: GridCell = {
			result: 'pending',
			teamShortName: 'ARS',
			opponentShortName: 'BUR',
			homeAway: 'H',
			fixtureId: 'fx-1',
			teamId: 't-ars',
			opponentTeamId: 't-bur',
			kickoff: '2026-03-01T15:00:00.000Z',
			fixtureStatus: 'scheduled',
		}
		render(
			<ProgressGrid
				rounds={[ROUND]}
				players={[player(cell)]}
				aliveCount={1}
				eliminatedCount={0}
				renderFormSheet={renderFormSheet}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Open fixture details for ARS' }))
		expect(renderFormSheet).toHaveBeenCalled()
		const args = renderFormSheet.mock.lastCall?.[0]
		expect(args).toMatchObject({
			fixtureId: 'fx-1',
			teamId: 't-ars',
			opponentTeamId: 't-bur',
			roundNumber: 12,
			open: true,
			fixtureSummary: {
				phase: 'pre_match',
				statusLabel: 'Kicks off',
				opponentShortName: 'BUR',
				homeAway: 'H',
				kickoff: '2026-03-01T15:00:00.000Z',
				score: null,
			},
		})
	})

	it('opens the sheet with the match result for a finished fixture', () => {
		const renderFormSheet = vi.fn<GridCellFormSheetRenderer>(() => null)
		const cell: GridCell = {
			result: 'win',
			teamShortName: 'ARS',
			opponentShortName: 'BUR',
			homeAway: 'H',
			score: '2-1',
			fixtureId: 'fx-1',
			teamId: 't-ars',
			opponentTeamId: 't-bur',
			kickoff: '2026-03-01T15:00:00.000Z',
			fixtureStatus: 'finished',
		}
		render(
			<ProgressGrid
				rounds={[ROUND]}
				players={[player(cell)]}
				aliveCount={1}
				eliminatedCount={0}
				renderFormSheet={renderFormSheet}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Open fixture details for ARS' }))
		const args = renderFormSheet.mock.lastCall?.[0]
		expect(args).toMatchObject({
			fixtureSummary: {
				phase: 'result',
				statusLabel: 'Full-time',
				score: '2-1',
			},
		})
	})

	it('offers no tap target for a cell with no fixture (no pick, locked, empty, skull)', () => {
		const renderFormSheet = vi.fn<GridCellFormSheetRenderer>(() => null)
		const players: GridPlayer[] = [
			{
				id: 'p1',
				userId: 'u1',
				name: 'Alice',
				status: 'alive',
				goals: 0,
				cellsByRoundId: { r1: { result: 'no_pick' } },
			},
			{
				id: 'p2',
				userId: 'u2',
				name: 'Bob',
				status: 'alive',
				goals: 0,
				cellsByRoundId: { r1: { result: 'locked' } },
			},
			{
				id: 'p3',
				userId: 'u3',
				name: 'Carol',
				status: 'eliminated',
				eliminatedRoundNumber: 12,
				goals: 0,
				cellsByRoundId: { r1: { result: 'skull' } },
			},
		]
		render(
			<ProgressGrid
				rounds={[ROUND]}
				players={players}
				aliveCount={2}
				eliminatedCount={1}
				renderFormSheet={renderFormSheet}
			/>,
		)

		expect(screen.queryByRole('button', { name: /^Open fixture details/ })).toBeNull()
	})

	it('renders no tap target when neither competitionId nor renderFormSheet is supplied', () => {
		const cell: GridCell = {
			result: 'win',
			teamShortName: 'ARS',
			fixtureId: 'fx-1',
			teamId: 't-ars',
			fixtureStatus: 'finished',
		}
		render(
			<ProgressGrid rounds={[ROUND]} players={[player(cell)]} aliveCount={1} eliminatedCount={0} />,
		)
		expect(screen.queryByRole('button', { name: /^Open fixture details/ })).toBeNull()
	})
})
