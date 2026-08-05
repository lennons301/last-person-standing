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

	it('gives a classic live pick its scoreboard and survival read', () => {
		const hero: GameHeroDescriptor = {
			kind: 'live',
			mode: 'classic',
			round,
			entry: {
				type: 'team',
				shortName: 'ARS',
				name: 'Arsenal',
				opponentName: 'Everton',
				side: 'home',
				fixture: {
					id: 'fixture-1',
					status: 'live',
					homeShort: 'ARS',
					awayShort: 'EVE',
					homeScore: 1,
					awayScore: 0,
					kickoffIso: '2099-08-08T14:00:00.000Z',
				},
			},
			survival: 'surviving',
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByText('Your pick')).toBeTruthy()
		expect(screen.getByText('Arsenal')).toBeTruthy()
		expect(screen.getByText('1–0')).toBeTruthy()
		expect(screen.getByText(/ARS 1–0 EVE · Live/)).toBeTruthy()
		expect(screen.getByText('Surviving')).toBeTruthy()
		// The picks are locked — no change affordance, no countdown.
		expect(screen.queryByRole('link', { name: /Change pick/ })).toBeNull()
		expect(screen.getByText('Picks locked')).toBeTruthy()
	})

	// The score sits directly after the picked team's name, so it has to read from
	// their side: "Burnley 3–0" for an away pick in a 3–0 home defeat is a lie.
	it('orients the score to the picked team when the pick was away', () => {
		const hero: GameHeroDescriptor = {
			kind: 'live',
			mode: 'classic',
			round,
			entry: {
				type: 'team',
				shortName: 'BUR',
				name: 'Burnley',
				opponentName: 'Manchester City',
				side: 'away',
				fixture: {
					id: 'fixture-2',
					status: 'finished',
					homeShort: 'MCI',
					awayShort: 'BUR',
					homeScore: 3,
					awayScore: 0,
					kickoffIso: '2099-08-08T14:00:00.000Z',
				},
			},
			survival: 'out',
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByText('0–3')).toBeTruthy()
		expect(screen.queryByText('3–0')).toBeNull()
		// The meta line keeps the true home–away scoreline, named on both sides.
		expect(screen.getByText(/MCI 3–0 BUR · Full time/)).toBeTruthy()
	})

	it('summarises a live ranked slate with lives left', () => {
		const hero: GameHeroDescriptor = {
			kind: 'live',
			mode: 'cup',
			round,
			entry: {
				type: 'ranked',
				picksMade: 6,
				picksRequired: 6,
				correct: 3,
				wrong: 1,
				pending: 2,
				livesRemaining: 1,
			},
			survival: 'surviving',
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByText('Your picks')).toBeTruthy()
		expect(screen.getByText('3 of 6 correct')).toBeTruthy()
		expect(screen.getByText('1 wrong · 2 still to play · 1 life left')).toBeTruthy()
	})

	it('calls out a missed deadline in the live hero', () => {
		const hero: GameHeroDescriptor = {
			kind: 'live',
			mode: 'classic',
			round,
			entry: { type: 'none' },
			survival: 'out',
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByText('No pick in')).toBeTruthy()
		expect(screen.getByText('You missed the deadline')).toBeTruthy()
		expect(screen.getByText('Out')).toBeTruthy()
	})

	it('reports the round result and points at the next round', () => {
		const hero: GameHeroDescriptor = {
			kind: 'round-result',
			mode: 'classic',
			round,
			entry: {
				type: 'team',
				shortName: 'ARS',
				name: 'Arsenal',
				opponentName: 'Everton',
				side: 'home',
				fixture: {
					id: 'fixture-1',
					status: 'finished',
					homeShort: 'ARS',
					awayShort: 'EVE',
					homeScore: 2,
					awayScore: 1,
					kickoffIso: '2099-08-08T14:00:00.000Z',
				},
			},
			result: 'survived',
			nextRound: {
				number: 8,
				label: 'GW8',
				longLabel: 'Gameweek 8',
				deadlineIso: '2099-08-15T17:30:00.000Z',
			},
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByRole('heading', { name: 'You survived Gameweek 7' })).toBeTruthy()
		expect(screen.getByText('2–1')).toBeTruthy()
		expect(screen.getByText(/Next up:/)).toBeTruthy()
		expect(screen.getByText('Gameweek 8')).toBeTruthy()
	})

	it('says the round is done for the single-round modes', () => {
		const hero: GameHeroDescriptor = {
			kind: 'round-result',
			mode: 'turbo',
			round,
			entry: {
				type: 'ranked',
				picksMade: 10,
				picksRequired: 10,
				correct: 7,
				wrong: 3,
				pending: 0,
				livesRemaining: null,
			},
			result: 'played',
			nextRound: null,
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByRole('heading', { name: 'Gameweek 7 is done' })).toBeTruthy()
		expect(screen.getByText('7 of 10 correct')).toBeTruthy()
		// Every slot has landed — no "0 still to play".
		expect(screen.getByText('3 wrong')).toBeTruthy()
		expect(screen.queryByText(/Next up:/)).toBeNull()
	})

	it('does not tell an eliminated player the next round is theirs', () => {
		const hero: GameHeroDescriptor = {
			kind: 'round-result',
			mode: 'classic',
			round,
			entry: { type: 'none' },
			result: 'eliminated',
			nextRound: {
				number: 8,
				label: 'GW8',
				longLabel: 'Gameweek 8',
				deadlineIso: '2099-08-15T17:30:00.000Z',
			},
			actingAsName: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByRole('heading', { name: "You're out" })).toBeTruthy()
		expect(screen.getByText(/The game goes on:/)).toBeTruthy()
		expect(screen.queryByText(/Next up:/)).toBeNull()
	})

	it('leads a completed game with the viewer’s own win', () => {
		const hero: GameHeroDescriptor = {
			kind: 'winner',
			mode: 'classic',
			round,
			winners: [
				{
					userId: 'user-1',
					name: 'Sean',
					potShare: '80.00',
					stats: [{ iconKey: 'list-checks', value: 7, label: 'rounds' }],
				},
			],
			runnerUpName: 'Dave',
			viewerOutcome: 'won',
			viewerPotShare: '80.00',
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByRole('heading', { name: 'You won £80.00' })).toBeTruthy()
		expect(screen.getByText('Sean')).toBeTruthy()
		expect(screen.getByText(/Runner-up:/)).toBeTruthy()
	})

	// Completed games have no current round (applyAutoCompletion nulls it out), so
	// the winner hero has to stand up without a round line.
	it('renders the winner hero with no round to name', () => {
		const hero: GameHeroDescriptor = {
			kind: 'winner',
			mode: 'classic',
			round: null,
			winners: [{ userId: 'user-1', name: 'Sean', potShare: '80.00', stats: [] }],
			runnerUpName: null,
			viewerOutcome: 'lost',
			viewerPotShare: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByRole('heading', { name: 'Sean wins' })).toBeTruthy()
		expect(screen.queryByText('Gameweek 7')).toBeNull()
	})

	it('quotes the viewer their own share of a split pot', () => {
		const hero: GameHeroDescriptor = {
			kind: 'winner',
			mode: 'turbo',
			round: null,
			winners: [
				{ userId: 'user-1', name: 'Sean', potShare: '16.67', stats: [] },
				{ userId: 'user-2', name: 'Dave', potShare: '16.66', stats: [] },
				{ userId: 'user-3', name: 'Rich', potShare: '16.66', stats: [] },
			],
			runnerUpName: null,
			viewerOutcome: 'shared',
			viewerPotShare: '16.66',
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(
			screen.getByRole('heading', { name: 'You share the pot — your cut is £16.66' }),
		).toBeTruthy()
	})

	it('names the winner when someone else took it', () => {
		const hero: GameHeroDescriptor = {
			kind: 'winner',
			mode: 'cup',
			round,
			winners: [
				{ userId: 'user-1', name: 'Sean', potShare: '50.00', stats: [] },
				{ userId: 'user-2', name: 'Dave', potShare: '50.00', stats: [] },
			],
			runnerUpName: null,
			viewerOutcome: 'lost',
			viewerPotShare: null,
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByRole('heading', { name: 'Sean & Dave share the pot' })).toBeTruthy()
		expect(screen.getByText('Split pot · 2 way')).toBeTruthy()
	})

	it('puts the rebuy call to action in the hero, with its action slot', () => {
		const hero: GameHeroDescriptor = {
			kind: 'rebuy',
			mode: 'classic',
			round,
			entryFee: '10.00',
			closesAtIso: '2099-08-15T17:30:00.000Z',
			pendingPayment: null,
			eliminatedRoundLabel: 'GW1',
		}
		render(
			<GameHero hero={hero} stats={stats} rebuyAction={<button type="button">Rebuy</button>} />,
		)
		expect(screen.getByRole('heading', { name: 'Buy back in for £10.00' })).toBeTruthy()
		expect(screen.getByText(/You went out in GW1\./)).toBeTruthy()
		expect(screen.getByRole('button', { name: 'Rebuy' })).toBeTruthy()
	})

	it('switches the rebuy hero to the pending-payment state', () => {
		const hero: GameHeroDescriptor = {
			kind: 'rebuy',
			mode: 'classic',
			round,
			entryFee: '10.00',
			closesAtIso: null,
			pendingPayment: { id: 'pay-1', amount: '10.00' },
			eliminatedRoundLabel: 'GW1',
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByRole('heading', { name: 'Rebuy payment pending' })).toBeTruthy()
	})

	it('goes quiet for a spectator', () => {
		const hero: GameHeroDescriptor = {
			kind: 'spectator',
			mode: 'classic',
			round,
			eliminatedRoundLabel: 'GW34',
		}
		render(<GameHero hero={hero} stats={stats} />)
		expect(screen.getByRole('region', { name: 'Spectating' })).toBeTruthy()
		expect(screen.getByText(/Eliminated in/)).toBeTruthy()
		expect(screen.getByText('GW34')).toBeTruthy()
		// Nothing to do here — no buttons, no call to action.
		expect(screen.queryByRole('link')).toBeNull()
		expect(screen.queryByRole('button')).toBeNull()
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
