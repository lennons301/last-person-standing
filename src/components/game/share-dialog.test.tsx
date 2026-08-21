// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { captionFor, ShareDialog } from './share-dialog'

const SUMMARY = [
	'*Gameweek 12 — 3 of 5 on Arsenal*',
	'',
	'4 of 5 still standing got a pick in.',
].join('\n')

const baseProps = {
	open: true,
	onOpenChange: () => {},
	gameId: 'g1',
	gameName: 'Cup Tuesday',
	pot: '40.00',
	inviteUrl: 'https://last-person-standing.app/join/ABC123',
	inviteCode: 'ABC123',
	defaultVariant: 'standings' as const,
	liveAvailable: false,
	winnerAvailable: false,
}

describe('captionFor', () => {
	it('carries the round summary as the standings image message', () => {
		expect(captionFor('standings', 'Cup Tuesday', SUMMARY)).toBe(SUMMARY)
	})

	it('falls back to the plain standings caption when there is no summary', () => {
		expect(captionFor('standings', 'Cup Tuesday', null)).toBe('Cup Tuesday — standings')
	})

	it('leaves the live and winner captions alone', () => {
		expect(captionFor('live', 'Cup Tuesday', SUMMARY)).toBe('Cup Tuesday — live update')
		expect(captionFor('winner', 'Cup Tuesday', SUMMARY)).toBe('Cup Tuesday — winner 🏆')
	})
})

describe('ShareDialog — round summary block', () => {
	it('shows the summary text with a copy button and a WhatsApp button', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

		render(<ShareDialog {...baseProps} roundSummaryText={SUMMARY} />)

		expect(screen.getByText('Round summary')).toBeTruthy()
		// Matched loosely then compared exactly: the default text matcher collapses
		// the blank line between paragraphs, and the paragraph breaks are the point.
		expect(screen.getByText(/3 of 5 on Arsenal/).textContent).toBe(SUMMARY)

		fireEvent.click(screen.getByRole('button', { name: /copy summary/i }))
		expect(writeText).toHaveBeenCalledWith(SUMMARY)

		const whatsapp = screen.getByRole('link', { name: /send to whatsapp/i })
		expect(whatsapp.getAttribute('href')).toBe(`https://wa.me/?text=${encodeURIComponent(SUMMARY)}`)
	})

	it('renders no summary block before a round has been locked', () => {
		render(<ShareDialog {...baseProps} roundSummaryText={null} />)

		expect(screen.queryByText('Round summary')).toBeNull()
	})
})
