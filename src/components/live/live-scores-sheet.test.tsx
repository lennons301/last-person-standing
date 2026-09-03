// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PRE_MATCH_COPY } from '@/lib/live/pre-match'
import type { LiveFixture, LivePayload, LivePick } from '@/lib/live/types'
import { LiveContext, type LiveContextValue } from './live-provider'
import { LiveScoresSheet } from './live-scores-sheet'

function fixture(overrides: Partial<LiveFixture> & { id: string }): LiveFixture {
	return {
		kickoff: new Date(),
		homeScore: null,
		awayScore: null,
		status: 'scheduled',
		homeShort: 'HOM',
		awayShort: 'AWY',
		homeTeamId: 't-home',
		awayTeamId: 't-away',
		winner: null,
		knockout: false,
		...overrides,
	}
}

function minutesFromNow(mins: number): Date {
	return new Date(Date.now() + mins * 60_000)
}

function payload(fixtures: LiveFixture[], overrides: Partial<LivePayload> = {}): LivePayload {
	return {
		gameId: 'g1',
		gameMode: 'classic',
		roundId: 'r1',
		fixtures,
		picks: [],
		players: [{ id: 'p1', userId: 'u1', status: 'active', livesRemaining: 0 }],
		viewerUserId: 'u1',
		updatedAt: new Date().toISOString(),
		...overrides,
	}
}

function viewerPick(fixtureId: string, overrides: Partial<LivePick> = {}): LivePick {
	return {
		gamePlayerId: 'p1',
		fixtureId,
		teamId: 't1',
		confidenceRank: null,
		predictedResult: 'home_win',
		result: null,
		preMatchWinProbability: null,
		...overrides,
	}
}

function renderSheet(value: Partial<LiveContextValue>) {
	const ctx: LiveContextValue = {
		payload: null,
		events: { goals: [], settlements: [] },
		isStale: false,
		reconnecting: false,
		...value,
	}
	return render(
		<LiveContext.Provider value={ctx}>
			<LiveScoresSheet />
		</LiveContext.Provider>,
	)
}

const LIVE_MATCHES = [
	fixture({
		id: 'f1',
		status: 'live',
		kickoff: minutesFromNow(-30),
		homeScore: 2,
		awayScore: 1,
		homeShort: 'ARS',
		awayShort: 'CHE',
	}),
	fixture({
		id: 'f2',
		status: 'halftime',
		kickoff: minutesFromNow(-20),
		homeScore: 0,
		awayScore: 0,
		homeShort: 'LIV',
		awayShort: 'EVE',
	}),
	fixture({
		id: 'f3',
		status: 'finished',
		kickoff: minutesFromNow(-300),
		homeScore: 3,
		awayScore: 0,
		homeShort: 'MCI',
		awayShort: 'BUR',
	}),
	fixture({ id: 'f4', kickoff: minutesFromNow(600), homeShort: 'NEW', awayShort: 'TOT' }),
]

describe('LiveScoresSheet', () => {
	it('renders no permanent score band — only the pop-out control', () => {
		renderSheet({ payload: payload(LIVE_MATCHES) })

		expect(screen.getByRole('button', { name: /live scores/i })).toBeTruthy()
		// None of the fixture cards are on the page until the pop-out is opened.
		expect(document.querySelectorAll('[data-fixture-id]').length).toBe(0)
		expect(screen.queryByText('ARS')).toBeNull()
	})

	it('opens the pop-out with every fixture in the round on click', () => {
		renderSheet({ payload: payload(LIVE_MATCHES) })

		fireEvent.click(screen.getByRole('button', { name: /live scores/i }))

		expect(screen.getByRole('dialog')).toBeTruthy()
		const cards = document.querySelectorAll('[data-fixture-id]')
		expect([...cards].map((c) => c.getAttribute('data-fixture-id'))).toEqual([
			'f1',
			'f2',
			'f4',
			'f3',
		])
		// Scores carried over from the old band, verbatim.
		expect(screen.getByText('ARS')).toBeTruthy()
		expect(screen.getByText('CHE')).toBeTruthy()
		expect(screen.getByText('MCI')).toBeTruthy()
		expect(screen.getByText('NEW')).toBeTruthy()
	})

	it('badges the viewer’s own pick inside the pop-out', () => {
		renderSheet({
			payload: payload(LIVE_MATCHES, { picks: [viewerPick('f1')] }),
		})

		fireEvent.click(screen.getByRole('button', { name: /live scores/i }))

		expect(screen.getByText('My pick')).toBeTruthy()
	})

	it('renders the pick’s pre-match win chance, labelled, on that pick’s card only', () => {
		renderSheet({
			payload: payload(LIVE_MATCHES, {
				picks: [viewerPick('f1', { preMatchWinProbability: 0.2249 })],
			}),
		})

		fireEvent.click(screen.getByRole('button', { name: /live scores/i }))

		// One chip, on the fixture the pick is on — a price frozen before kickoff,
		// said so, sitting beside a live score.
		expect(screen.getAllByText('Pre-match 22%').length).toBe(1)
		// Two visible words are enough on screen beside the badge; the non-visual
		// path gets the whole sentence rather than a tooltip nobody announces.
		expect(screen.getByText(PRE_MATCH_COPY.expansion)).toBeTruthy()
		expect(document.querySelector('[data-fixture-id="f1"]')?.textContent).toContain('Pre-match 22%')
	})

	it('renders no figure at all for a pick on a fixture we hold no price for', () => {
		renderSheet({
			payload: payload(LIVE_MATCHES, {
				picks: [viewerPick('f1', { preMatchWinProbability: null })],
			}),
		})

		fireEvent.click(screen.getByRole('button', { name: /live scores/i }))

		// The pick is still badged; the absent market renders as nothing, never 0%.
		expect(screen.getByText('My pick')).toBeTruthy()
		expect(screen.queryByText(/pre-match/i)).toBeNull()
		expect(screen.queryByText(PRE_MATCH_COPY.expansion)).toBeNull()
		expect(screen.queryByText(/0%/)).toBeNull()
	})

	it('counts the matches in play on the control', () => {
		renderSheet({ payload: payload(LIVE_MATCHES) })

		expect(screen.getByRole('button', { name: /2 matches in play/i })).toBeTruthy()
	})

	it('renders nothing when there is no live action', () => {
		renderSheet({
			payload: payload([
				fixture({ id: 'f3', status: 'finished', kickoff: minutesFromNow(-300) }),
				fixture({ id: 'f4', kickoff: minutesFromNow(600) }),
			]),
		})

		expect(screen.queryByRole('button', { name: /live scores/i })).toBeNull()
	})

	it('renders nothing before the first live payload arrives', () => {
		renderSheet({ payload: null })

		expect(screen.queryByRole('button', { name: /live scores/i })).toBeNull()
	})

	it('surfaces the reconnecting chip inside the pop-out', () => {
		renderSheet({ payload: payload(LIVE_MATCHES), reconnecting: true })

		expect(screen.queryByText(/reconnecting/i)).toBeNull()
		fireEvent.click(screen.getByRole('button', { name: /live scores/i }))

		expect(screen.getByText(/reconnecting/i)).toBeTruthy()
	})
})
