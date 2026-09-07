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

describe('ProgressGrid — current-week picks filter', () => {
	it('shows submitted current-week picks, including eliminated players, and shares that selection', () => {
		const onShare = vi.fn()
		const players: GridPlayer[] = [
			{
				id: 'p1',
				userId: 'u1',
				name: 'Alice',
				status: 'alive',
				goals: 0,
				cellsByRoundId: { r1: { result: 'win', teamShortName: 'ARS' } },
			},
			{
				id: 'p2',
				userId: 'u2',
				name: 'Bob',
				status: 'eliminated',
				eliminatedRoundNumber: 12,
				goals: 0,
				cellsByRoundId: { r1: { result: 'loss', teamShortName: 'CHE' } },
			},
			{
				id: 'p3',
				userId: 'u3',
				name: 'Carol',
				status: 'alive',
				goals: 0,
				cellsByRoundId: { r1: { result: 'no_pick' } },
			},
		]
		render(
			<ProgressGrid
				rounds={[ROUND]}
				players={players}
				aliveCount={2}
				eliminatedCount={1}
				currentRoundId="r1"
				onShare={onShare}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Current week picks' }))
		expect(screen.getByText('Alice')).toBeTruthy()
		expect(screen.getByText('Bob')).toBeTruthy()
		expect(screen.queryByText('Carol')).toBeNull()

		fireEvent.click(screen.getByRole('button', { name: 'Share grid' }))
		expect(onShare).toHaveBeenCalledWith(expect.stringContaining('currentRoundPicks=1'))
	})

	it('falls back to last week once the game has moved on to a round nobody has picked yet', () => {
		const priorRound: GridRound = { ...ROUND, id: 'r12', number: 12, picksLocked: true }
		const newRound: GridRound = {
			...ROUND,
			id: 'r13',
			number: 13,
			label: 'GW13',
			picksLocked: false,
		}
		const players: GridPlayer[] = [
			{
				id: 'p1',
				userId: 'u1',
				name: 'Alice',
				status: 'alive',
				goals: 0,
				cellsByRoundId: {
					r12: { result: 'win', teamShortName: 'ARS' },
					r13: { result: 'empty' },
				},
			},
			{
				id: 'p2',
				userId: 'u2',
				name: 'Bob',
				status: 'eliminated',
				eliminatedRoundNumber: 12,
				goals: 0,
				cellsByRoundId: { r12: { result: 'loss', teamShortName: 'CHE' } },
			},
		]
		render(
			<ProgressGrid
				rounds={[priorRound, newRound]}
				players={players}
				aliveCount={1}
				eliminatedCount={1}
				currentRoundId="r13"
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Current week picks' }))
		expect(screen.getByText('Alice')).toBeTruthy()
		expect(screen.getByText('Bob')).toBeTruthy()
	})
})

describe('ProgressGrid — last-complete-week picks filter', () => {
	it('shows players who had a pick in the most recently locked round, including anyone just eliminated, and shares that selection', () => {
		const onShare = vi.fn()
		const lockedRound: GridRound = { ...ROUND, id: 'r12', number: 12, picksLocked: true }
		const players: GridPlayer[] = [
			{
				id: 'p1',
				userId: 'u1',
				name: 'Alice',
				status: 'alive',
				goals: 0,
				cellsByRoundId: { r12: { result: 'win', teamShortName: 'ARS' } },
			},
			{
				id: 'p2',
				userId: 'u2',
				name: 'Bob',
				status: 'eliminated',
				eliminatedRoundNumber: 12,
				goals: 0,
				cellsByRoundId: { r12: { result: 'loss', teamShortName: 'CHE' } },
			},
			{
				id: 'p3',
				userId: 'u3',
				name: 'Carol',
				status: 'alive',
				goals: 0,
				cellsByRoundId: { r12: { result: 'no_pick' } },
			},
		]
		render(
			<ProgressGrid
				rounds={[lockedRound]}
				players={players}
				aliveCount={2}
				eliminatedCount={1}
				onShare={onShare}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Last complete week' }))
		expect(screen.getByText('Alice')).toBeTruthy()
		expect(screen.getByText('Bob')).toBeTruthy()
		expect(screen.queryByText('Carol')).toBeNull()

		fireEvent.click(screen.getByRole('button', { name: 'Share grid' }))
		expect(onShare).toHaveBeenCalledWith(expect.stringContaining('lastCompleteWeek=1'))
	})

	it("keeps reporting last week even once someone's advance pick lands on the new current round", () => {
		const priorRound: GridRound = { ...ROUND, id: 'r12', number: 12, picksLocked: true }
		const newRound: GridRound = {
			...ROUND,
			id: 'r13',
			number: 13,
			label: 'GW13',
			picksLocked: false,
		}
		const players: GridPlayer[] = [
			{
				id: 'p1',
				userId: 'u1',
				name: 'Alice',
				status: 'alive',
				goals: 0,
				cellsByRoundId: {
					r12: { result: 'win', teamShortName: 'ARS' },
					// Advance pick already in for the new round — this is exactly
					// what makes "Current week picks" jump to r13 while "Last
					// complete week" must stay on r12.
					r13: { result: 'locked' },
				},
			},
			{
				id: 'p2',
				userId: 'u2',
				name: 'Bob',
				status: 'eliminated',
				eliminatedRoundNumber: 12,
				goals: 0,
				cellsByRoundId: { r12: { result: 'loss', teamShortName: 'CHE' }, r13: { result: 'empty' } },
			},
		]
		render(
			<ProgressGrid
				rounds={[priorRound, newRound]}
				players={players}
				aliveCount={1}
				eliminatedCount={1}
				currentRoundId="r13"
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Last complete week' }))
		expect(screen.getByText('Alice')).toBeTruthy()
		expect(screen.getByText('Bob')).toBeTruthy()
	})
})
