// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PositionLine } from './position-line'

afterEach(cleanup)

const SERIES = [
	{ matchday: 4, position: 11, points: 7 },
	{ matchday: 5, position: 9, points: 10 },
	{ matchday: 6, position: 6, points: 13 },
]

describe('PositionLine', () => {
	it('draws the line and states where the record starts and where it has got to', () => {
		const { container } = render(<PositionLine points={SERIES} tableSize={20} />)
		expect(container.querySelector('polyline')).toBeTruthy()
		expect(container.querySelectorAll('circle')).toHaveLength(3)
		// A series that starts at matchday 4 says so — the snapshot accumulates
		// from deployment, so a late start is the truth, not a gap to hide.
		expect(screen.getByText('MD4')).toBeTruthy()
		expect(screen.getByText('MD6')).toBeTruthy()
		expect(screen.getByText(/6th after 6 played/)).toBeTruthy()
		expect(screen.getByText(/best 6th/)).toBeTruthy()
		expect(screen.getByText(/worst 11th/)).toBeTruthy()
	})

	it('scales the axis to the table, so 20th is the floor and not the worst point seen', () => {
		const { container } = render(<PositionLine points={SERIES} tableSize={20} />)
		const labels = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
		expect(labels).toContain('1')
		expect(labels).toContain('20')
	})

	it('draws a single matchday as a point, with no line through one observation', () => {
		const { container } = render(
			<PositionLine points={[{ matchday: 1, position: 12, points: 0 }]} tableSize={20} />,
		)
		expect(container.querySelector('polyline')).toBeNull()
		expect(container.querySelectorAll('circle')).toHaveLength(1)
		expect(screen.getByText('MD1')).toBeTruthy()
	})

	it('says the history has not started yet rather than drawing empty axes', () => {
		const { container } = render(<PositionLine points={[]} />)
		expect(container.querySelector('svg')).toBeNull()
		expect(screen.getByText(/No position history yet/)).toBeTruthy()
	})

	it('falls back to the worst position seen when no table size is known', () => {
		const { container } = render(<PositionLine points={SERIES} tableSize={null} />)
		const labels = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
		expect(labels).toContain('11')
	})
})
