// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameIdentityBar } from '@/components/game/game-identity-bar'

function renderBar(overrides: Partial<Parameters<typeof GameIdentityBar>[0]> = {}) {
	const onShare = vi.fn()
	render(
		<GameIdentityBar
			name="Thursday Night Survivors"
			mode="classic"
			competition="Premier League 2026/27"
			entryFee="10.00"
			onShare={onShare}
			{...overrides}
		/>,
	)
	return { onShare }
}

describe('GameIdentityBar', () => {
	it('names the game and its competition', () => {
		renderBar()
		expect(screen.getByRole('heading', { name: 'Thursday Night Survivors' })).toBeTruthy()
		expect(screen.getByText('Premier League 2026/27')).toBeTruthy()
	})

	it('exposes the mode rules — with the entry fee — from the mode chip', () => {
		renderBar({ mode: 'cup' })
		expect(screen.queryByText('Cup — how it works')).toBeNull()

		fireEvent.click(screen.getByRole('button', { name: 'How cup mode works' }))

		expect(screen.getByText('Cup — how it works')).toBeTruthy()
		expect(screen.getByText('£10.00')).toBeTruthy()
	})

	it('reaches the share flow from the bar', () => {
		const { onShare } = renderBar()
		fireEvent.click(screen.getByRole('button', { name: 'Share' }))
		expect(onShare).toHaveBeenCalledOnce()
	})

	it('never prints the invite code — that lives in the share flow', () => {
		renderBar()
		expect(screen.queryByText(/invite code/i)).toBeNull()
	})
})
