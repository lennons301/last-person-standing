'use client'

import { XCircle } from 'lucide-react'
import { useLiveGame } from '@/components/live/use-live-game'
import type { CupLadderData, CupLadderFixture } from '@/lib/game/cup-standings-queries'
import { cn } from '@/lib/utils'

interface CupTimelineProps {
	data: CupLadderData
}

// A "kickoff slot" is a unique kickoff time across the round's fixtures.
interface KickoffSlot {
	key: string
	label: string // e.g. "Sat 15:00"
	fullLabel: string // e.g. "Sat 17 Jan, 15:00"
	time: number // epoch ms
	fixtures: CupLadderFixture[]
}

interface PlayerTimeline {
	playerId: string
	playerName: string
	livesRemaining: number
	status: 'alive' | 'eliminated' | 'winner'
	picks: Array<{
		fixtureId: string
		confidenceRank: number
		result: 'win' | 'saved_by_life' | 'loss' | 'pending' | 'hidden' | 'restricted'
		livesGained: number
		livesSpent: number
		pickedTeamId: string
		pickedSide: 'home' | 'away'
	}>
}

export function CupTimeline({ data }: CupTimelineProps) {
	const { events } = useLiveGame()
	const eliminatedGpIds = new Set(
		events.settlements.filter((ev) => ev.result === 'settled-loss').map((ev) => ev.gamePlayerId),
	)

	// Build kickoff slots
	const slotMap = new Map<string, KickoffSlot>()
	for (const f of data.fixtures) {
		if (!f.kickoff) continue
		const d = new Date(f.kickoff)
		// Group by rounded hour to handle minor differences
		const key = `${d.toDateString()}T${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
		let slot = slotMap.get(key)
		if (!slot) {
			slot = {
				key,
				label: `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
				fullLabel: `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
				time: d.getTime(),
				fixtures: [],
			}
			slotMap.set(key, slot)
		}
		slot.fixtures.push(f)
	}

	const slots = Array.from(slotMap.values()).sort((a, b) => a.time - b.time)

	if (slots.length === 0) {
		return (
			<div className="p-6 text-center text-sm text-muted-foreground">
				Kickoff times not available for this round.
			</div>
		)
	}

	// Build a fixture → slot index lookup
	const fixtureSlot = new Map<string, number>()
	slots.forEach((slot, i) => {
		for (const f of slot.fixtures) fixtureSlot.set(f.id, i)
	})

	// Pull all picks for all players and index by player
	const playerPicksByRank = new Map<
		string,
		Map<
			number,
			Array<{
				fixtureId: string
				confidenceRank: number
				result: 'win' | 'saved_by_life' | 'loss' | 'pending' | 'hidden' | 'restricted'
				livesGained: number
				livesSpent: number
				pickedTeamId: string
				pickedSide: 'home' | 'away'
			}>
		>
	>()

	for (const player of data.players) {
		const picksMap = new Map<
			number,
			Array<{
				fixtureId: string
				confidenceRank: number
				result: 'win' | 'saved_by_life' | 'loss' | 'pending' | 'hidden' | 'restricted'
				livesGained: number
				livesSpent: number
				pickedTeamId: string
				pickedSide: 'home' | 'away'
			}>
		>()

		for (const pick of player.picks) {
			const list = picksMap.get(pick.confidenceRank) ?? []
			list.push({
				fixtureId: pick.fixtureId,
				confidenceRank: pick.confidenceRank,
				result: pick.result,
				livesGained: pick.livesGained,
				livesSpent: pick.livesSpent,
				pickedTeamId: pick.pickedTeamId,
				pickedSide: pick.pickedSide,
			})
			picksMap.set(pick.confidenceRank, list)
		}
		playerPicksByRank.set(player.id, picksMap)
	}

	// Build timelines for each player
	const timelines: PlayerTimeline[] = data.players.map((player) => ({
		playerId: player.id,
		playerName: player.name,
		livesRemaining: player.livesRemaining,
		status: player.status,
		picks: player.picks,
	}))

	// Sort: survivors first (by lives remaining desc, streak desc, goals desc), then eliminated
	timelines.sort((a, b) => {
		const aAlive = a.status !== 'eliminated'
		const bAlive = b.status !== 'eliminated'
		if (aAlive && !bAlive) return -1
		if (!aAlive && bAlive) return 1
		if (aAlive && bAlive) {
			return b.livesRemaining - a.livesRemaining
		}
		return 0
	})

	const slotWidth = `minmax(120px, 1fr)`

	return (
		<div className="space-y-5">
			{/* Slot header row */}
			<div
				className="grid gap-2"
				style={{ gridTemplateColumns: `180px repeat(${slots.length}, ${slotWidth})` }}
			>
				<div />
				{slots.map((slot) => (
					<div key={slot.key} className="rounded-md border border-border bg-card p-2.5 text-xs">
						<div className="font-semibold uppercase tracking-wide text-[0.65rem] text-muted-foreground">
							{slot.label}
						</div>
						<div className="mt-1 text-foreground font-medium">
							{slot.fixtures.length} {slot.fixtures.length === 1 ? 'fixture' : 'fixtures'}
						</div>
					</div>
				))}
			</div>

			{/* Player rows */}
			<div className="space-y-2">
				{timelines.map((t) => (
					<div
						key={t.playerId}
						className={cn(
							'grid gap-2 items-stretch',
							eliminatedGpIds.has(t.playerId) && 'opacity-45 transition-opacity duration-[400ms]',
						)}
						style={{
							gridTemplateColumns: `180px repeat(${slots.length}, ${slotWidth})`,
						}}
					>
						<div className="flex items-center gap-2 px-2">
							<div className="flex items-center gap-1.5 min-w-0 flex-1">
								{t.status === 'winner' ? (
									<span className="text-lg shrink-0">🏆</span>
								) : t.status === 'eliminated' ? (
									<XCircle className="h-4 w-4 text-[var(--eliminated)] shrink-0" />
								) : (
									<span className="text-lg shrink-0">✓</span>
								)}
								<span
									className={cn(
										'font-semibold text-sm truncate',
										t.status === 'eliminated' && 'text-muted-foreground',
									)}
								>
									<span className="flex items-center gap-2">
										{t.playerName}
										{t.livesRemaining === 0 && <span className="h-2 w-2 rounded-full bg-red-600" />}
									</span>
								</span>
							</div>
						</div>

						{slots.map((slot) => {
							// Find the player's picks that resolve in this slot
							const picksInSlot = t.picks.filter((p) => {
								const slotIdx = fixtureSlot.get(p.fixtureId)
								return slotIdx === slots.indexOf(slot)
							})

							if (picksInSlot.length === 0) {
								return (
									<div
										key={slot.key}
										className="rounded-md border border-border flex items-center gap-1 px-2 py-1.5 text-[0.65rem] bg-muted/10"
									>
										<span className="text-muted-foreground text-[0.6rem] italic">—</span>
									</div>
								)
							}

							// For cup mode, we typically show one pick per slot per player
							// Render cells with life-change bars
							return (
								<div key={slot.key} className="flex flex-col gap-1">
									{picksInSlot.map((pick) => {
										const cellBgColour =
											pick.result === 'win'
												? 'bg-[var(--alive)] text-white'
												: pick.result === 'saved_by_life'
													? 'bg-amber-600 text-white'
													: pick.result === 'loss'
														? 'bg-[var(--eliminated)] text-white'
														: 'bg-muted text-foreground'

										const fixture = data.fixtures.find((f) => f.id === pick.fixtureId)
										if (!fixture) return null

										const label =
											pick.pickedSide === 'home'
												? fixture.homeTeam.shortName
												: fixture.awayTeam.shortName

										return (
											<div
												key={`${pick.fixtureId}-${pick.confidenceRank}`}
												className={cn(
													'relative h-8 w-14 rounded-sm flex items-center justify-center text-[10px] font-semibold',
													cellBgColour,
												)}
											>
												{label}
												{pick.livesGained > 0 && (
													<span className="absolute right-0 top-0 bottom-0 w-1 bg-emerald-700 rounded-r-sm" />
												)}
												{pick.livesSpent > 0 && (
													<span className="absolute right-0 top-0 bottom-0 w-1 bg-amber-700 rounded-r-sm" />
												)}
											</div>
										)
									})}
								</div>
							)
						})}
					</div>
				))}
			</div>
		</div>
	)
}
