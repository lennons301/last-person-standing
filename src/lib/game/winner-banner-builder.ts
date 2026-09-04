import type { CupLadderData } from '@/lib/game/cup-standings-queries'
import type { HeroWinnerEntry } from '@/lib/game/game-view'
import type { GridView, TurboStandings } from '@/lib/game/read/standings'
import { calculatePayouts } from '@/lib/game-logic/prizes'

// Feeds the game hero's `winner` variant via `buildGameView`, so the payload
// crosses the Server → Client Component boundary (page.tsx → GameDetailView).
// Everything in here must be JSON-serializable. There is a unit test
// (`winner-banner-builder.test.ts`) that round-trips the result via
// `structuredClone` to enforce this — `structuredClone` throws on function
// refs, where `JSON.stringify` silently drops them. Don't add Date / Map /
// component refs / class instances here without updating that test.

type WinnerPlayerInput = {
	id: string
	userId: string
	status: 'alive' | 'eliminated' | 'winner'
}

interface BuildWinnerBannerInput {
	gameMode: 'classic' | 'turbo' | 'cup'
	gameStatus: string
	potTotal: string
	players: WinnerPlayerInput[]
	turboStandings: TurboStandings | null
	cupStandings: CupLadderData | null
	classicGrid: GridView | null
}

export interface WinnerBannerPayload {
	winners: HeroWinnerEntry[]
	runnerUpName?: string
}

export function buildWinnerBanner(input: BuildWinnerBannerInput): WinnerBannerPayload | null {
	if (input.gameStatus !== 'completed') return null
	const winnerPlayers = input.players.filter((p) => p.status === 'winner')
	if (winnerPlayers.length === 0) return null

	const payouts = calculatePayouts(
		input.potTotal,
		winnerPlayers.map((p) => p.userId),
	)
	const potShareFor = (userId: string) =>
		payouts.find((po) => po.userId === userId)?.amount ?? '0.00'

	if (
		input.gameMode === 'turbo' &&
		input.turboStandings &&
		input.turboStandings.rounds.length > 0
	) {
		const lastRound = input.turboStandings.rounds[input.turboStandings.rounds.length - 1]
		const winners: HeroWinnerEntry[] = winnerPlayers.map((p) => {
			const tp = lastRound.players.find((x) => x.id === p.id)
			return {
				userId: p.userId,
				name: tp?.name ?? 'Player',
				potShare: potShareFor(p.userId),
				stats: [
					{ iconKey: 'flame', value: tp?.streak ?? 0, label: 'streak' },
					{ iconKey: 'target', value: tp?.goals ?? 0, label: 'goals' },
				],
			}
		})
		const winnerIds = new Set(winnerPlayers.map((p) => p.id))
		const runnerUp = [...lastRound.players]
			.filter((tp) => !winnerIds.has(tp.id))
			.sort((a, b) => b.streak - a.streak || b.goals - a.goals)[0]
		return { winners, runnerUpName: runnerUp?.name }
	}

	if (input.gameMode === 'cup' && input.cupStandings) {
		const winners: HeroWinnerEntry[] = winnerPlayers.map((p) => {
			const cp = input.cupStandings?.players.find((x) => x.id === p.id)
			return {
				userId: p.userId,
				name: cp?.name ?? 'Player',
				potShare: potShareFor(p.userId),
				stats: [
					{ iconKey: 'heart', value: cp?.livesRemaining ?? 0, label: 'lives' },
					{ iconKey: 'flame', value: cp?.streak ?? 0, label: 'streak' },
					{ iconKey: 'target', value: cp?.goals ?? 0, label: 'goals' },
				],
			}
		})
		const winnerIds = new Set(winnerPlayers.map((p) => p.id))
		const others = [...input.cupStandings.players]
			.filter((cp) => !winnerIds.has(cp.id))
			.sort(
				(a, b) => b.livesRemaining - a.livesRemaining || b.streak - a.streak || b.goals - a.goals,
			)
		return { winners, runnerUpName: others[0]?.name }
	}

	if (input.gameMode === 'classic') {
		const roundsPlayed = input.classicGrid?.rounds.length ?? 0
		const winners: HeroWinnerEntry[] = winnerPlayers.map((p) => ({
			userId: p.userId,
			name: input.classicGrid?.players.find((x) => x.id === p.id)?.name ?? 'Player',
			potShare: potShareFor(p.userId),
			stats: [{ iconKey: 'list-checks', value: roundsPlayed || '—', label: 'rounds' }],
		}))
		return { winners }
	}

	return null
}
