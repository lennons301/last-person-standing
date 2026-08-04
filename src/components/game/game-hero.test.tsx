// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameHero } from '@/components/game/game-hero'
import type { GameHeroDescriptor, GameViewStats } from '@/lib/game/game-view'

const stats: GameViewStats = {
	potConfirmed: '60.00',
	potTotal: '80.00',
	aliveCount: 5,
	playerCount: 8,
	rebuyAvailable: false,
}

const round = {
	number: 7,
	label: 'GW7',
	longLabel: 'Gameweek 7',
	deadlineIso: '2099-08-08T17:30:00.000Z',
}

describe('GameHero', () => {
	it('renders a loud call to action when no pick is in', () => {
		const hero: GameHeroDescriptor = {
			kind: 'pick-open',
			mode: 'classic',
			round,
			picksMade: 0,
			picksRequired: 1,
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByRole('heading', { name: 'Make your pick' })).toBeTruthy()
		expect(screen.getByRole('link', { name: 'Make your pick' }).getAttribute('href')).toBe('#pick')
		// Round label + deadline live in the hero, not a separate strip.
		expect(screen.getByText('Gameweek 7')).toBeTruthy()
		expect(screen.getByText('GW7')).toBeTruthy()
	})

	it('nudges a partial ranked entry with its progress', () => {
		const hero: GameHeroDescriptor = {
			kind: 'pick-open',
			mode: 'turbo',
			round,
			picksMade: 4,
			picksRequired: 10,
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByRole('heading', { name: 'Finish your picks' })).toBeTruthy()
		expect(screen.getByText('4 of 10 ranked so far.')).toBeTruthy()
	})

	it('pluralises the call to action for multi-pick modes', () => {
		const hero: GameHeroDescriptor = {
			kind: 'pick-open',
			mode: 'cup',
			round,
			picksMade: 0,
			picksRequired: 6,
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByRole('heading', { name: 'Make your picks' })).toBeTruthy()
	})

	it('confirms a made classic pick with a change affordance', () => {
		const hero: GameHeroDescriptor = {
			kind: 'pick-made',
			mode: 'classic',
			round,
			pick: {
				type: 'team',
				shortName: 'ARS',
				name: 'Arsenal',
				opponentName: 'Everton',
				side: 'home',
				kickoffIso: '2099-08-08T14:00:00.000Z',
				isAuto: false,
			},
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByText("You're in")).toBeTruthy()
		expect(screen.getByText('Arsenal')).toBeTruthy()
		expect(screen.getByText(/vs Everton \(H\)/)).toBeTruthy()
		expect(screen.getByRole('link', { name: /Change pick/ }).getAttribute('href')).toBe('#pick')
		expect(screen.getByText('Editable until the deadline')).toBeTruthy()
	})

	it('labels an auto-submitted pick and renders notices inside the hero', () => {
		const hero: GameHeroDescriptor = {
			kind: 'pick-made',
			mode: 'cup',
			round,
			pick: { type: 'ranked', picksMade: 6, picksRequired: 6, isAuto: true },
			actingAsName: 'Dave',
		}
		render(<GameHero hero={hero} stats={stats} notices={<p>We auto-picked for you</p>} />)
		expect(screen.getByText('Auto-pick locked in')).toBeTruthy()
		expect(screen.getByText('6 of 6 predictions locked')).toBeTruthy()
		expect(screen.getByText('Picking as Dave')).toBeTruthy()
		const notice = screen.getByText('We auto-picked for you')
		expect(screen.getByRole('region', { name: 'Your pick' }).contains(notice)).toBe(true)
	})

	it('renders the stat line', () => {
		const hero: GameHeroDescriptor = {
			kind: 'pick-open',
			mode: 'classic',
			round,
			picksMade: 0,
			picksRequired: 1,
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={{ ...stats, rebuyAvailable: true }} />)
		expect(screen.getByText('£60.00')).toBeTruthy()
		expect(screen.getByText('5')).toBeTruthy()
		expect(screen.getByText('Rebuy available')).toBeTruthy()
	})

	it('renders nothing when there is no hero state yet', () => {
		const { container } = render(
			<GameHero
				hero={{ kind: 'none', mode: 'classic', round: null, reason: 'round-locked' }}
				stats={stats}
			/>,
		)
		expect(container.innerHTML).toBe('')
	})
})
