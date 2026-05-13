'use client'

import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { LocalDateTime } from '@/components/local-datetime'
import { Disclosure } from '@/components/ui/disclosure'
import { cn } from '@/lib/utils'
import { FixtureRow, type SideState } from './fixture-row'
import { HeartIcon } from './heart-icon'
import { LivesSummary } from './lives-summary'
import { PlusNBadge } from './plus-n-badge'
import { TeamBadge } from './team-badge'
import { TierPips } from './tier-pips'

export interface CupPickFixture {
	id: string
	homeTeamId: string
	awayTeamId: string
	homeShort: string
	homeName: string
	homeColor: string | null
	homeBadgeUrl: string | null
	awayShort: string
	awayName: string
	awayColor: string | null
	awayBadgeUrl: string | null
	kickoff: Date | null
	/** From home perspective: positive = home is higher tier, negative = away is higher tier. */
	tierDifference: number
}

export interface CupPickSlot {
	confidenceRank: number
	fixtureId: string
	pickedSide: 'home' | 'away'
}

interface CupPickProps {
	fixtures: CupPickFixture[]
	/** 6 for WC, up to 10 for domestic cup. */
	numberOfPicks: number
	livesRemaining: number
	maxLives: number
	initialSlots: CupPickSlot[]
	onSubmit: (slots: CupPickSlot[]) => Promise<void>
	deadline?: Date | null
	readonly?: boolean
	/** When set (e.g. "Submit as Rachel" for admin acting-as), overrides the default submit label. */
	submitLabelOverride?: string
	competitionId?: string
	roundNumber?: number
}

function tierForDisplay(fixture: CupPickFixture): {
	value: number
	plusN: number
	heart: boolean
	underdogSide: 'home' | 'away' | null
} {
	const abs = Math.abs(fixture.tierDifference)
	// tierDifference > 0 → home stronger → underdog is away.
	// tierDifference < 0 → away stronger → underdog is home.
	// tierDifference === 0 → no underdog (no bonus available).
	const underdogSide: 'home' | 'away' | null =
		fixture.tierDifference > 0 ? 'away' : fixture.tierDifference < 0 ? 'home' : null
	return { value: abs, plusN: abs, heart: abs >= 2, underdogSide }
}

function sideRestricted(
	fixture: CupPickFixture,
	side: 'home' | 'away',
): { kind: 'restricted'; reason: string } | undefined {
	// Cup rule: can't pick a side more than 1 tier higher than the opponent.
	const tierFromPicked = side === 'home' ? fixture.tierDifference : -fixture.tierDifference
	if (tierFromPicked > 1) {
		return {
			kind: 'restricted',
			reason: `Restricted — opponent is ${tierFromPicked} tiers lower`,
		}
	}
	return undefined
}

/** Sum of abs(tierDifference) for slots where the picked side is the underdog. */
function computeProjectedGain(slots: CupPickSlot[], fixtures: CupPickFixture[]): number {
	let total = 0
	for (const slot of slots) {
		const f = fixtures.find((x) => x.id === slot.fixtureId)
		if (!f) continue
		const abs = Math.abs(f.tierDifference)
		if (abs === 0) continue
		// Underdog is away when home is higher (tierDifference > 0), home when away is higher.
		const underdogSide: 'home' | 'away' = f.tierDifference > 0 ? 'away' : 'home'
		if (slot.pickedSide === underdogSide) {
			total += abs
		}
	}
	return total
}

export function CupPick({
	fixtures,
	numberOfPicks,
	livesRemaining,
	maxLives,
	initialSlots,
	onSubmit,
	deadline,
	readonly,
	submitLabelOverride,
	competitionId,
	roundNumber,
}: CupPickProps) {
	// Normalise initial slots into rank order (1..N) — defensive against callers passing gaps.
	const normalisedInitial = useMemo<CupPickSlot[]>(
		() =>
			initialSlots
				.slice()
				.sort((a, b) => a.confidenceRank - b.confidenceRank)
				.map((slot, i) => ({ ...slot, confidenceRank: i + 1 })),
		[initialSlots],
	)

	const [slots, setSlots] = useState<CupPickSlot[]>(normalisedInitial)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Predecessor app allowed any number of ranked picks (1..numberOfPicks).
	// The previous 60% minimum was spec drift — restoring the predecessor's
	// behaviour avoids the silent server/UI mismatch where the UI allowed 60%
	// but the server demanded the full count.
	const minPicks = 1

	function handlePickTeam(fixtureId: string, side: 'home' | 'away') {
		if (readonly) return
		const existing = slots.find((s) => s.fixtureId === fixtureId)
		if (existing) {
			// Fixture can only appear once — ignore. (Removal happens from the ranked column.)
			return
		}
		if (slots.length >= numberOfPicks) return
		setSlots([
			...slots,
			{
				confidenceRank: slots.length + 1,
				fixtureId,
				pickedSide: side,
			},
		])
	}

	function handleRemoveSlot(confidenceRank: number) {
		if (readonly) return
		setSlots(
			slots
				.filter((s) => s.confidenceRank !== confidenceRank)
				.sort((a, b) => a.confidenceRank - b.confidenceRank)
				.map((s, i) => ({ ...s, confidenceRank: i + 1 })),
		)
	}

	function handleReorder(fromRank: number, toRank: number) {
		if (readonly) return
		if (fromRank === toRank) return
		const from = slots.find((s) => s.confidenceRank === fromRank)
		const to = slots.find((s) => s.confidenceRank === toRank)
		if (!from || !to) return
		setSlots(
			slots
				.map((s) => {
					if (s.confidenceRank === fromRank) return { ...s, confidenceRank: toRank }
					if (s.confidenceRank === toRank) return { ...s, confidenceRank: fromRank }
					return s
				})
				.sort((a, b) => a.confidenceRank - b.confidenceRank),
		)
	}

	async function handleSubmit() {
		if (readonly) return
		if (slots.length < minPicks) return
		setLoading(true)
		setError(null)
		try {
			await onSubmit(slots)
		} catch (e) {
			// Task 8 updates the pick API to surface a typed cup error; for now just show message.
			const message = e instanceof Error ? e.message : 'Failed to submit picks'
			setError(message)
		} finally {
			setLoading(false)
		}
	}

	const projectedGain = computeProjectedGain(slots, fixtures)

	return (
		<div className="space-y-3">
			<LivesSummary
				livesRemaining={livesRemaining}
				maxLives={maxLives}
				projectedGain={projectedGain}
			/>
			<div className="rounded-lg bg-foreground text-background px-3 py-2 text-xs">
				{deadline ? (
					<>
						Deadline <LocalDateTime date={deadline} />
					</>
				) : (
					'Deadline not set'
				)}{' '}
				· rank {numberOfPicks} picks
			</div>
			<div className="grid gap-3 md:grid-cols-[1fr_320px]">
				<Disclosure
					className="order-2 md:order-1"
					title="Available fixtures"
					subtitle={`${fixtures.length} fixture${fixtures.length === 1 ? '' : 's'} this round`}
					defaultOpen
				>
					<div className="space-y-3 p-3">
						{fixtures.map((f) => {
							const tier = tierForDisplay(f)
							const slot = slots.find((s) => s.fixtureId === f.id)

							const homeState: SideState | undefined =
								slot?.pickedSide === 'home' ? { kind: 'current' } : sideRestricted(f, 'home')
							const awayState: SideState | undefined =
								slot?.pickedSide === 'away' ? { kind: 'current' } : sideRestricted(f, 'away')

							return (
								<FixtureRow
									key={f.id}
									home={{
										id: f.homeTeamId,
										name: f.homeName,
										shortName: f.homeShort,
										badgeUrl: f.homeBadgeUrl,
									}}
									away={{
										id: f.awayTeamId,
										name: f.awayName,
										shortName: f.awayShort,
										badgeUrl: f.awayBadgeUrl,
									}}
									kickoff={f.kickoff}
									selectedSide={slot?.pickedSide ?? null}
									tierValue={tier.value}
									tierMax={3}
									plusN={tier.plusN}
									showHeart={tier.heart}
									underdogSide={tier.underdogSide}
									homeState={homeState}
									awayState={awayState}
									onPickHome={() => handlePickTeam(f.id, 'home')}
									onPickAway={() => handlePickTeam(f.id, 'away')}
									competitionId={competitionId}
									roundNumber={roundNumber}
								/>
							)
						})}
					</div>
				</Disclosure>
				<Disclosure
					className="order-1 md:order-2"
					title="Your picks, ranked"
					subtitle={`${slots.length} of ${numberOfPicks} selected${slots.length < minPicks ? ` — need ${minPicks}` : ''}`}
					defaultOpen
				>
					<div className="p-3">
						<div className="space-y-1.5">
							{Array.from({ length: numberOfPicks }, (_, i) => i + 1).map((rank) => {
								const slot = slots.find((s) => s.confidenceRank === rank)
								if (!slot) return <EmptySlot key={rank} rank={rank} />
								return (
									<CupRankedRow
										key={rank}
										slot={slot}
										fixtures={fixtures}
										isFirst={rank === 1}
										isLast={rank === slots.length}
										onMoveUp={() => handleReorder(rank, rank - 1)}
										onMoveDown={() => handleReorder(rank, rank + 1)}
										onRemove={() => handleRemoveSlot(rank)}
									/>
								)
							})}
						</div>
						<button
							type="button"
							className={cn(
								'mt-3 w-full rounded bg-foreground text-background py-3 font-semibold',
								'disabled:opacity-50 disabled:cursor-not-allowed',
								'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
							)}
							disabled={readonly || slots.length < minPicks || loading}
							onClick={handleSubmit}
						>
							{loading
								? 'Submitting...'
								: (submitLabelOverride ?? `Submit ${slots.length} of ${numberOfPicks} picks`)}
						</button>
						{error && (
							<p className="mt-2 text-xs text-[var(--eliminated)]" role="alert">
								{error}
							</p>
						)}
					</div>
				</Disclosure>
			</div>
		</div>
	)
}

interface EmptySlotProps {
	rank: number
}

function EmptySlot({ rank }: EmptySlotProps) {
	return (
		<div
			className={cn(
				'flex items-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-3 py-2.5',
				'text-xs text-muted-foreground',
			)}
		>
			<div
				className={cn(
					'w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold shrink-0',
					'bg-muted text-muted-foreground',
				)}
			>
				{rank}
			</div>
			<span>Pick a fixture to fill slot #{rank}</span>
		</div>
	)
}

interface CupRankedRowProps {
	slot: CupPickSlot
	fixtures: CupPickFixture[]
	isFirst: boolean
	isLast: boolean
	onMoveUp: () => void
	onMoveDown: () => void
	onRemove: () => void
}

function CupRankedRow({
	slot,
	fixtures,
	isFirst,
	isLast,
	onMoveUp,
	onMoveDown,
	onRemove,
}: CupRankedRowProps) {
	const fixture = fixtures.find((f) => f.id === slot.fixtureId)
	if (!fixture) {
		return (
			<div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
				<div className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold text-background bg-foreground shrink-0">
					{slot.confidenceRank}
				</div>
				<span>Fixture unavailable</span>
				<button
					type="button"
					onClick={onRemove}
					className="ml-auto text-muted-foreground hover:text-[var(--eliminated)] p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					aria-label="Remove"
				>
					<X className="h-4 w-4" />
				</button>
			</div>
		)
	}

	const pickedTeam =
		slot.pickedSide === 'home'
			? { short: fixture.homeShort, name: fixture.homeName, badge: fixture.homeBadgeUrl }
			: { short: fixture.awayShort, name: fixture.awayName, badge: fixture.awayBadgeUrl }
	const opponent =
		slot.pickedSide === 'home'
			? { short: fixture.awayShort, name: fixture.awayName }
			: { short: fixture.homeShort, name: fixture.homeName }

	const abs = Math.abs(fixture.tierDifference)
	// Underdog if the picked side is the lower tier.
	const underdogSide: 'home' | 'away' | null =
		fixture.tierDifference === 0 ? null : fixture.tierDifference > 0 ? 'away' : 'home'
	const isUnderdog = underdogSide != null && slot.pickedSide === underdogSide
	const outcomeHint = isUnderdog
		? `Win → +${abs} ${abs === 1 ? 'life' : 'lives'}`
		: abs > 0
			? 'Win → no life gained'
			: 'Win → no life gained'

	return (
		<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
			<div
				className={cn(
					'w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold text-background shrink-0',
					slot.confidenceRank <= 3 ? 'bg-[var(--alive)]' : 'bg-foreground',
				)}
			>
				{slot.confidenceRank}
			</div>
			<div className="flex items-center gap-2 min-w-0 flex-1">
				<TeamBadge shortName={pickedTeam.short} badgeUrl={pickedTeam.badge} size="md" />
				<div className="min-w-0 flex-1">
					<div className="text-sm font-semibold truncate">
						{pickedTeam.name} to beat {opponent.name}
					</div>
					<div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
						{isUnderdog && <HeartIcon size={12} />}
						{abs > 0 && <TierPips value={abs as 0 | 1 | 2 | 3 | 4 | 5} max={3} />}
						{abs > 0 && <PlusNBadge value={abs} />}
						<span className="ml-auto truncate">{outcomeHint}</span>
					</div>
				</div>
			</div>
			<div className="flex flex-col gap-0.5 shrink-0">
				<button
					type="button"
					onClick={onMoveUp}
					disabled={isFirst}
					className="border border-border rounded p-1 disabled:opacity-30 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					aria-label="Move up"
				>
					<ChevronUp className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					onClick={onMoveDown}
					disabled={isLast}
					className="border border-border rounded p-1 disabled:opacity-30 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					aria-label="Move down"
				>
					<ChevronDown className="h-3.5 w-3.5" />
				</button>
			</div>
			<button
				type="button"
				onClick={onRemove}
				className="text-muted-foreground hover:text-[var(--eliminated)] p-1 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				aria-label="Remove"
			>
				<X className="h-4 w-4" />
			</button>
		</div>
	)
}
