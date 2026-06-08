// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameRulesDialog } from './game-rules-dialog'

describe('GameRulesDialog', () => {
	it('renders cup-specific rules when mode is cup', () => {
		render(<GameRulesDialog mode="cup" open={true} onOpenChange={vi.fn()} />)
		expect(screen.getByRole('dialog', { name: /cup — how it works/i })).toBeTruthy()
		// Cup-only mechanics surface.
		expect(screen.getByText('Lives & survival')).toBeTruthy()
		expect(screen.getByText('Underdog rewards')).toBeTruthy()
	})

	it('renders the matching rules for each mode', () => {
		for (const mode of ['classic', 'turbo', 'cup'] as const) {
			const { unmount } = render(<GameRulesDialog mode={mode} open={true} onOpenChange={vi.fn()} />)
			expect(
				screen.getByRole('dialog', { name: new RegExp(`${mode} — how it works`, 'i') }),
			).toBeTruthy()
			unmount()
		}
	})

	it('is case-insensitive and falls back to classic for unknown modes', () => {
		render(<GameRulesDialog mode="MYSTERY" open={true} onOpenChange={vi.fn()} />)
		expect(screen.getByRole('dialog', { name: /classic — how it works/i })).toBeTruthy()
	})
})
