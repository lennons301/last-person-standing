import { describe, expect, it } from 'vitest'
import { Footer, Header, modeLabel, OverflowTailRow, PageFrame } from './shared'

describe('share/shared', () => {
	it('Header renders with live pill', () => {
		const el = Header({
			gameName: 'Test',
			modeLabel: 'Classic',
			competitionName: 'WC',
			pot: '100.00',
			livePill: true,
		})
		expect(el).toBeTruthy()
	})

	it('Header renders without pills', () => {
		const el = Header({
			gameName: 'Test',
			modeLabel: 'Classic',
			competitionName: 'WC',
			pot: '100.00',
		})
		expect(el).toBeTruthy()
	})

	it('Footer renders with date', () => {
		const el = Footer({ generatedAt: new Date('2026-04-27T12:00:00Z') })
		expect(el).toBeTruthy()
	})

	it('OverflowTailRow renders with count and label', () => {
		const el = OverflowTailRow({ count: 5, label: 'eliminated earlier' })
		expect(el).toBeTruthy()
	})

	it('PageFrame wraps children with width 1080', () => {
		const el = PageFrame({
			height: 800,
			children: Header({ gameName: 'x', modeLabel: 'Classic', competitionName: 'WC', pot: '0' }),
		})
		expect((el.props as { style: { width: string } }).style.width).toBe('1080px')
	})

	it('modeLabel capitalises correctly', () => {
		expect(modeLabel('classic')).toBe('Classic')
		expect(modeLabel('cup')).toBe('Cup')
		expect(modeLabel('turbo')).toBe('Turbo')
	})
})
