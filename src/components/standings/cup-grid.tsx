'use client'

import type { CupStandingsData } from '@/lib/game/cup-standings-queries'
import { cn } from '@/lib/utils'

interface CupGridProps {
	data: CupStandingsData
}

export function CupGrid({ data }: CupGridProps) {
	const alive = data.players
		.filter((p) => p.status !== 'eliminated')
		.sort((a, b) => b.streak - a.streak || b.goals - a.goals)
	const out = data.players
		.filter((p) => p.status === 'eliminated')
		.sort((a, b) => (a.eliminatedRoundNumber ?? 0) - (b.eliminatedRoundNumber ?? 0))

	return (
		<div className="rounded-xl border border-border bg-card overflow-hidden">
			<div className="p-4 md:p-5 border-b border-border">
				<h2 className="font-display text-2xl font-semibold">Cup Standings</h2>
				<p className="text-sm text-muted-foreground mt-1">
					GW{data.roundNumber} ·{' '}
					{data.roundStatus === 'open'
						? 'Picks hidden until deadline'
						: data.roundStatus === 'active'
							? 'Round in play'
							: 'Round complete'}
				</p>
			</div>

			<div className="overflow-x-auto p-4 md:p-5">
				<HeaderRow numberOfPicks={data.numberOfPicks} />
				{alive.map((player, idx) => (
					<PlayerRow
						key={player.id}
						player={player}
						numberOfPicks={data.numberOfPicks}
						maxLives={data.maxLives}
						position={idx + 1}
					/>
				))}
				{out.length > 0 && (
					<div className="mt-3 pt-3 border-t-2 border-dashed border-border">
						<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
							Eliminated
						</p>
						{out.map((player, idx) => (
							<PlayerRow
								key={player.id}
								player={player}
								numberOfPicks={data.numberOfPicks}
								maxLives={data.maxLives}
								position={alive.length + idx + 1}
								isOut
							/>
						))}
					</div>
				)}
			</div>
		</div>
	)
}

function HeaderRow({ numberOfPicks }: { numberOfPicks: number }) {
	return (
		<div
			className="grid grid-cols-[24px_140px_80px_48px_48px_repeat(var(--picks),62px)] gap-1.5 px-1 py-1.5 items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
			style={{ ['--picks' as string]: numberOfPicks }}
		>
			<div>#</div>
			<div>Player</div>
			<div>Lives</div>
			<div className="text-center">Strk</div>
			<div className="text-center">Gls</div>
			{Array.from({ length: numberOfPicks }, (_, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: rank columns are stable
					key={i}
					className="text-center"
				>
					#{i + 1}
				</div>
			))}
		</div>
	)
}

function PlayerRow({
	player,
	numberOfPicks,
	maxLives,
	position,
	isOut,
}: {
	player: CupStandingsData['players'][number]
	numberOfPicks: number
	maxLives: number
	position: number
	isOut?: boolean
}) {
	return (
		<div
			className={cn(
				'grid grid-cols-[24px_140px_80px_48px_48px_repeat(var(--picks),62px)] gap-1.5 px-1 py-1.5 items-center border-t border-border',
				isOut && 'opacity-55',
			)}
			style={{ ['--picks' as string]: numberOfPicks }}
		>
			<div className="font-display font-bold text-muted-foreground">{position}</div>
			<div className="flex items-center gap-2 min-w-0">
				<Avatar name={player.name} />
				<span className="text-sm font-semibold truncate">{player.name}</span>
				{!player.hasSubmitted && <Badge tone="warn">NO PICKS</Badge>}
				{isOut && <Badge tone="danger">OUT GW{player.eliminatedRoundNumber ?? '?'}</Badge>}
			</div>
			<LivesCell remaining={player.livesRemaining} max={maxLives} />
			<div className="text-center font-bold">{player.streak || '—'}</div>
			<div className="text-center">{player.goals || '—'}</div>
			{Array.from({ length: numberOfPicks }, (_, i) => {
				const rank = i + 1
				const pick = player.picks.find((p) => p.confidenceRank === rank)
				return <GridCell key={rank} pick={pick} />
			})}
		</div>
	)
}

function LivesCell({ remaining, max }: { remaining: number; max: number }) {
	return (
		<div className="flex items-center gap-0.5">
			{Array.from({ length: max }, (_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: stable index
					key={i}
					className={cn(
						'inline-block h-2.5 w-2.5 rounded-full',
						i < remaining ? 'bg-[#dc2626]' : 'ring-1 ring-inset ring-border',
					)}
				/>
			))}
			<span
				className={cn(
					'ml-1 text-[10px]',
					remaining === 0 ? 'text-red-600 font-bold' : 'text-muted-foreground',
				)}
			>
				{remaining}/{max}
				{remaining === 0 ? ' ⚠' : ''}
			</span>
		</div>
	)
}

function GridCell({ pick }: { pick?: CupStandingsData['players'][number]['picks'][number] }) {
	if (!pick) {
		return <div className="h-9 w-14 rounded border border-dashed border-border bg-muted/40" />
	}
	if (pick.result === 'hidden') {
		return (
			<div className="h-9 w-14 rounded border border-dashed border-border bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
				🔒
			</div>
		)
	}
	if (pick.result === 'restricted') {
		return (
			<div className="h-9 w-14 rounded border border-dashed border-border bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
				—
			</div>
		)
	}
	const bg =
		pick.result === 'win'
			? 'bg-[var(--alive)]'
			: pick.result === 'saved_by_life'
				? 'bg-amber-500'
				: pick.result === 'loss'
					? 'bg-[var(--eliminated)]'
					: 'bg-muted'
	const fg = pick.result === 'pending' ? 'text-foreground/70' : 'text-white'
	const label = pick.pickedSide === 'home' ? pick.homeShort : pick.awayShort
	return (
		<div
			className={cn(
				'relative h-9 w-14 rounded flex flex-col items-center justify-center text-[10px] font-bold',
				bg,
				fg,
			)}
		>
			<span>{label}</span>
			<span className="text-[8px] opacity-90">
				{pick.tierDifference <= -1 ? `+${Math.abs(pick.tierDifference)}` : ''}
			</span>
			{pick.livesGained > 0 && (
				<span className="absolute -top-1.5 -right-1.5 bg-emerald-700 text-white text-[8px] px-1 rounded-full font-bold">
					+{pick.livesGained}
				</span>
			)}
			{pick.livesSpent > 0 && (
				<span className="absolute -top-1.5 -right-1.5 bg-amber-800 text-white text-[8px] px-1 rounded-full font-bold">
					-{pick.livesSpent}
				</span>
			)}
		</div>
	)
}

function Avatar({ name }: { name: string }) {
	const initials = name
		.split(/\s+/)
		.map((part) => part[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase()
	return (
		<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground/80 shrink-0">
			{initials || '?'}
		</span>
	)
}

function Badge({ tone, children }: { tone: 'warn' | 'danger'; children: React.ReactNode }) {
	const cls =
		tone === 'danger'
			? 'bg-[var(--eliminated-bg)] text-[var(--eliminated)]'
			: 'bg-[var(--draw-bg)] text-[var(--draw)]'
	return (
		<span
			className={cn(
				'inline-flex items-center rounded px-1.5 py-0.5 text-[0.6rem] font-semibold leading-none',
				cls,
			)}
		>
			{children}
		</span>
	)
}
