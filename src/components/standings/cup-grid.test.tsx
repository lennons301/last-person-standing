// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CupStandingsData, CupStandingsPlayer } from '@/lib/game/cup-standings-queries'
import { CupGrid } from './cup-grid'

// CupGrid reads the live context only for goal/elimination animations — the
// displayed values all come from the `data` prop. A null payload is the default.
vi.mock('@/components/live/use-live-game', () => ({
	useLiveGame: () => ({
		payload: null,
		events: { goals: [], settlements: [] },
		isStale: false,
		reconnecting: false,
	}),
}))

function player(over: Partial<CupStandingsPlayer>): CupStandingsPlayer {
	return {
		id: 'gp',
		userId: 'u',
		name: 'Player',
		status: 'alive',
		livesRemaining: 0,
		streak: 0,
		goals: 0,
		provisional: false,
		hasSubmitted: true,
		eliminatedRoundNumber: null,
		eliminatedRoundLabel: null,
		picks: [],
		...over,
	}
}

function data(players: CupStandingsPlayer[]): CupStandingsData {
	return {
		gameId: 'g',
		roundId: 'r',
		roundNumber: 4,
		roundLabel: 'Round of 32',
		roundStatus: 'active',
		maxLives: 0,
		numberOfPicks: 2,
		players,
	}
}

describe('CupGrid lives + provisional rendering', () => {
	it('renders lives as a heart + count, never an X/Y fraction', () => {
		render(<CupGrid data={data([player({ id: 'a', name: 'Alice', livesRemaining: 2 })])} />)
		const row = screen.getByText('Alice').closest('[data-gpid]') as HTMLElement
		expect(within(row).getByText('♥')).toBeTruthy()
		expect(within(row).getByText('2')).toBeTruthy()
		// No fraction denominator anywhere in the row.
		expect(row.textContent).not.toMatch(/\d\/\d/)
	})

	it('flags zero lives with a warning and dims (no phantom 0/0)', () => {
		render(<CupGrid data={data([player({ id: 'a', name: 'Alice', livesRemaining: 0 })])} />)
		const row = screen.getByText('Alice').closest('[data-gpid]') as HTMLElement
		expect(row.textContent).toContain('♥')
		expect(row.textContent).toContain('⚠')
		expect(row.textContent).not.toContain('0/0')
	})

	it('marks a provisional row with a * on streak / goals / lives + shows the legend', () => {
		render(
			<CupGrid
				data={data([
					player({
						id: 'a',
						name: 'Alice',
						streak: 1,
						goals: 1,
						livesRemaining: 1,
						provisional: true,
					}),
				])}
			/>,
		)
		const row = screen.getByText('Alice').closest('[data-gpid]') as HTMLElement
		// streak "1*", goals "1*", lives "1*"
		expect(within(row).getAllByText('*', { exact: false }).length).toBeGreaterThanOrEqual(1)
		expect(row.textContent).toContain('1*')
		// Legend explaining the marker is present once any row is provisional.
		expect(screen.getByText(/provisional/i)).toBeTruthy()
	})

	it('does NOT show the provisional legend when every row is settled', () => {
		render(
			<CupGrid data={data([player({ id: 'a', name: 'Alice', streak: 2, provisional: false })])} />,
		)
		expect(screen.queryByText(/provisional/i)).toBeNull()
	})
})
