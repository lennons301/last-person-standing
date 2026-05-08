'use client'

import { Flame, Hourglass, Target, XCircle } from 'lucide-react'
import { LocalDateTime } from '@/components/local-datetime'
import { cn } from '@/lib/utils'
import type { LadderFixture, LadderPrediction } from './turbo-ladder'

interface TurboTimelineProps {
	fixtures: LadderFixture[]
	players: Array<{
		id: string
		name: string
		streak: number
		goals: number
		hasSubmitted: boolean
	}>
}

// A "kickoff slot" is a unique kickoff time across the round's fixtures.
interface KickoffSlot {
	key: string
	kickoff: Date // header rendered via <LocalDateTime />
	time: number // epoch ms — used for sorting only
	fixtures: LadderFixture[]
}

interface PlayerTimeline {
	playerId: string
	playerName: string
	streak: number
	goals: number
	hasSubmitted: boolean
	// The slot at which the streak locked in or ended
	resolvedSlotIndex: number
	// The slot index where the streak broke (null if streak wasn't broken by the end)
	brokeAtSlotIndex: number | null
	// The rank at which the streak ended (null if still unbroken / no picks)
	brokeAtRank: number | null
}

export function TurboTimeline({ fixtures, players }: TurboTimelineProps) {
	// Build kickoff slots
	const slotMap = new Map<string, KickoffSlot>()
	for (const f of fixtures) {
		if (!f.kickoff) continue
		const d = new Date(f.kickoff)
		// Group by rounded hour to handle minor differences
		const key = `${d.toDateString()}T${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
		let slot = slotMap.get(key)
		if (!slot) {
			slot = {
				key,
				kickoff: d,
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

	// Pull all predictions for all fixtures and index by player
	const playerPicks = new Map<string, LadderPrediction[]>()
	for (const f of fixtures) {
		for (const p of f.predictions) {
			if (p.hidden) continue // don't show hidden picks in the timeline
			const list = playerPicks.get(p.playerId) ?? []
			list.push(p)
			playerPicks.set(p.playerId, list)
		}
	}

	// For each player, compute when their streak resolved
	const timelines: PlayerTimeline[] = players.map((player) => {
		const picks = (playerPicks.get(player.id) ?? []).slice().sort((a, b) => a.rank - b.rank)

		// Find the rank where streak broke (first incorrect pick), or null if all correct / not enough data
		let brokeAtRank: number | null = null
		let streakPicks: LadderPrediction[] = []
		for (const pk of picks) {
			if (pk.correct === false) {
				brokeAtRank = pk.rank
				streakPicks = picks.filter((p) => p.rank <= pk.rank) // include the breaker
				break
			}
			if (pk.correct === true) {
				streakPicks.push(pk)
			} else {
				// Pending — streak is still open
				streakPicks.push(pk)
			}
		}
		if (brokeAtRank === null) streakPicks = picks

		// Find the slot where the streak was "sealed" — the latest kickoff slot among streakPicks
		let resolvedSlotIndex = -1
		let brokeAtSlotIndex: number | null = null
		for (const pk of streakPicks) {
			// Find the fixture for this pick via player's predictions
			const fixture = fixtures.find((f) =>
				f.predictions.some((pr) => pr.playerId === player.id && pr.rank === pk.rank),
			)
			if (!fixture) continue
			const idx = fixtureSlot.get(fixture.id)
			if (idx != null) {
				resolvedSlotIndex = Math.max(resolvedSlotIndex, idx)
				if (brokeAtRank !== null && pk.rank === brokeAtRank) {
					brokeAtSlotIndex = idx
				}
			}
		}
		if (resolvedSlotIndex === -1) resolvedSlotIndex = 0

		return {
			playerId: player.id,
			playerName: player.name,
			streak: player.streak,
			goals: player.goals,
			hasSubmitted: player.hasSubmitted,
			resolvedSlotIndex,
			brokeAtSlotIndex,
			brokeAtRank,
		}
	})

	// Sort timelines: survivors first (by streak desc, goals desc), then broken (by brokeAtSlotIndex desc = latest drama first)
	timelines.sort((a, b) => {
		const aAlive = a.brokeAtRank === null
		const bAlive = b.brokeAtRank === null
		if (aAlive && !bAlive) return -1
		if (!aAlive && bAlive) return 1
		if (aAlive && bAlive) {
			if (b.streak !== a.streak) return b.streak - a.streak
			return b.goals - a.goals
		}
		// Both broken — later dropouts first (more drama)
		return (b.brokeAtSlotIndex ?? 0) - (a.brokeAtSlotIndex ?? 0)
	})

	// Per-slot stats: how many players are still alive BEFORE this slot resolves
	const aliveAfterSlot: number[] = slots.map((_, i) => {
		return timelines.filter((t) => t.brokeAtRank === null || (t.brokeAtSlotIndex ?? 99) > i).length
	})
	const totalPlayers = timelines.filter((t) => t.hasSubmitted).length

	// For each slot, find which players have a "critical" pick resolving — i.e. a pick in their streak line
	// that hasn't yet been sealed (not yet resolved) before this slot
	const criticalCountPerSlot: number[] = slots.map((_, slotIdx) => {
		let count = 0
		for (const t of timelines) {
			if (t.brokeAtRank !== null && (t.brokeAtSlotIndex ?? 99) < slotIdx) continue
			// Has this player got a streak pick in this slot?
			const picks = playerPicks.get(t.playerId) ?? []
			const maxRank = t.brokeAtRank ?? picks.length
			const relevant = picks.filter((p) => p.rank <= maxRank)
			const hasPickHere = relevant.some((p) => {
				const fixture = fixtures.find((f) =>
					f.predictions.some((pr) => pr.playerId === t.playerId && pr.rank === p.rank),
				)
				return fixture && fixtureSlot.get(fixture.id) === slotIdx
			})
			if (hasPickHere) count++
		}
		return count
	})

	// For each slot, find biggest dropout numbers (players whose streak broke in this slot)
	const dropoutsPerSlot: number[] = slots.map((_, slotIdx) => {
		return timelines.filter((t) => t.brokeAtSlotIndex === slotIdx).length
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
				{slots.map((slot, i) => {
					const prevAlive = i === 0 ? totalPlayers : aliveAfterSlot[i - 1]
					const aliveAfter = aliveAfterSlot[i]
					const dropouts = dropoutsPerSlot[i]
					const critical = criticalCountPerSlot[i]
					return (
						<div
							key={slot.key}
							className={cn(
								'rounded-md border bg-card p-2.5 text-xs',
								dropouts > 0 && 'border-[var(--eliminated)]/40',
							)}
						>
							<LocalDateTime
								date={slot.kickoff}
								options={{ weekday: 'short', hour: '2-digit', minute: '2-digit' }}
								className="font-semibold uppercase tracking-wide text-[0.65rem] text-muted-foreground block"
							/>
							<div className="mt-1 text-foreground font-medium">
								{slot.fixtures.length} {slot.fixtures.length === 1 ? 'fixture' : 'fixtures'}
							</div>
							<div className="mt-1 text-[0.65rem] text-muted-foreground">
								{critical > 0 ? (
									<span>
										{critical} streak{critical === 1 ? '' : 's'} live
									</span>
								) : (
									<span>No streaks at stake</span>
								)}
							</div>
							{dropouts > 0 && (
								<div className="mt-1 flex items-center gap-1 text-[0.65rem] font-semibold text-[var(--eliminated)]">
									<XCircle className="h-3 w-3" />
									{dropouts} out
								</div>
							)}
							<div className="mt-1.5 flex items-center justify-between">
								<span className="text-[0.65rem] text-muted-foreground">Alive:</span>
								<div className="flex items-center gap-1">
									<span className="text-[0.65rem] font-semibold">{prevAlive}</span>
									<span className="text-[0.6rem] text-muted-foreground">→</span>
									<span
										className={cn(
											'text-[0.65rem] font-semibold',
											aliveAfter < prevAlive ? 'text-[var(--eliminated)]' : 'text-[var(--alive)]',
										)}
									>
										{aliveAfter}
									</span>
								</div>
							</div>
						</div>
					)
				})}
			</div>

			{/* Player rows */}
			<div className="space-y-2">
				{timelines.map((t, i) => (
					<div
						key={t.playerId}
						className="grid gap-2 items-stretch"
						style={{
							gridTemplateColumns: `180px repeat(${slots.length}, ${slotWidth})`,
						}}
					>
						<div className="flex items-center gap-2 px-2">
							<div className="flex items-center gap-1.5 min-w-0 flex-1">
								{t.brokeAtRank === null ? (
									<span className="text-lg shrink-0">{i === 0 ? '🏆' : '✓'}</span>
								) : (
									<XCircle className="h-4 w-4 text-[var(--eliminated)] shrink-0" />
								)}
								<span
									className={cn(
										'font-semibold text-sm truncate',
										t.brokeAtRank !== null && 'text-muted-foreground',
									)}
								>
									{t.playerName}
								</span>
							</div>
							<div className="flex flex-col items-end shrink-0">
								<span className="flex items-center gap-0.5 text-xs font-semibold">
									<Flame className="h-3 w-3 text-[var(--draw)]" />
									{t.streak}
								</span>
								<span className="flex items-center gap-0.5 text-[0.65rem] text-muted-foreground">
									<Target className="h-2.5 w-2.5" />
									{t.goals}
								</span>
							</div>
						</div>

						{slots.map((slot, slotIdx) => {
							const isBreakSlot = t.brokeAtSlotIndex === slotIdx
							const isBeforeBreak =
								t.brokeAtRank === null || slotIdx <= (t.brokeAtSlotIndex ?? slots.length - 1)
							const isAfterBreak = t.brokeAtRank !== null && slotIdx > (t.brokeAtSlotIndex ?? -1)
							const isResolvedSlot = slotIdx === t.resolvedSlotIndex && t.brokeAtRank === null

							// Find the player's picks that resolve in this slot
							const picks = playerPicks.get(t.playerId) ?? []
							const maxRank = t.brokeAtRank ?? picks.length
							const picksInSlot = picks.filter((p) => {
								if (p.rank > maxRank) return false
								const fixture = fixtures.find((f) =>
									f.predictions.some((pr) => pr.playerId === t.playerId && pr.rank === p.rank),
								)
								return fixture && fixtureSlot.get(fixture.id) === slotIdx
							})

							return (
								<div
									key={slot.key}
									className={cn(
										'rounded-md border flex items-center gap-1 px-2 py-1.5 text-[0.65rem]',
										isAfterBreak && 'border-dashed border-border bg-muted/10 opacity-40',
										isBeforeBreak &&
											!isBreakSlot &&
											'border-[var(--alive)]/30 bg-[var(--alive-bg)]/40',
										isBreakSlot && 'border-[var(--eliminated)] bg-[var(--eliminated-bg)]',
										isResolvedSlot && 'border-[var(--alive)] bg-[var(--alive-bg)]',
									)}
								>
									{picksInSlot.length === 0 ? (
										<span className="text-muted-foreground text-[0.6rem] italic">—</span>
									) : (
										<div className="flex flex-wrap gap-1 w-full">
											{picksInSlot.map((pk) => {
												const label =
													pk.prediction === 'home_win'
														? fixtures.find((f) =>
																f.predictions.some(
																	(pr) => pr.playerId === t.playerId && pr.rank === pk.rank,
																),
															)?.home.shortName
														: pk.prediction === 'away_win'
															? fixtures.find((f) =>
																	f.predictions.some(
																		(pr) => pr.playerId === t.playerId && pr.rank === pk.rank,
																	),
																)?.away.shortName
															: 'DRW'
												const bg =
													isBreakSlot && pk.rank === t.brokeAtRank
														? 'bg-[var(--eliminated)] text-white'
														: pk.correct
															? 'bg-[var(--alive)] text-white'
															: pk.correct === false
																? 'bg-[var(--eliminated)] text-white'
																: 'bg-muted text-foreground'
												return (
													<span
														key={pk.rank}
														className={cn(
															'inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-semibold',
															bg,
														)}
														title={`Rank ${pk.rank}: ${label}`}
													>
														<span className="text-[0.55rem] opacity-80">#{pk.rank}</span>
														<span>{label}</span>
													</span>
												)
											})}
										</div>
									)}
								</div>
							)
						})}
					</div>
				))}
			</div>

			{/* Legend */}
			<div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground pt-2 border-t border-border">
				<div className="flex items-center gap-1.5">
					<span className="inline-block w-3 h-3 rounded border border-[var(--alive)]/30 bg-[var(--alive-bg)]/40" />
					Streak running through this slot
				</div>
				<div className="flex items-center gap-1.5">
					<span className="inline-block w-3 h-3 rounded border border-[var(--eliminated)] bg-[var(--eliminated-bg)]" />
					Streak broke here
				</div>
				<div className="flex items-center gap-1.5">
					<Hourglass className="h-3 w-3" />
					Kickoff slots grouped by start time
				</div>
			</div>
		</div>
	)
}
