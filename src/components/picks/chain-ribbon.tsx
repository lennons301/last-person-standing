'use client'

import { cn } from '@/lib/utils'

export type ChainSlotState =
	| { kind: 'win'; teamShort: string; teamColour: string | null }
	| { kind: 'loss'; teamShort: string; teamColour: string | null }
	| { kind: 'draw'; teamShort: string; teamColour: string | null }
	| { kind: 'current'; teamShort: string | null; teamColour: string | null }
	| { kind: 'planned'; teamShort: string; teamColour: string | null }
	| { kind: 'planned-locked'; teamShort: string; teamColour: string | null }
	| { kind: 'empty' }
	| { kind: 'tbc' }

export interface ChainSlot {
	roundId: string
	roundNumber: number
	roundLabel: string
	state: ChainSlotState
}

interface ChainRibbonProps {
	slots: ChainSlot[]
	summary: { played: number; planned: number; availableTeams: number; totalTeams: number }
}

export function ChainRibbon({ slots, summary }: ChainRibbonProps) {
	return (
		<div className="rounded-xl border border-border bg-card px-3 py-2.5">
			<div className="flex justify-between items-center mb-2">
				<div>
					<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Your pick chain
					</div>
					<div className="text-xs text-muted-foreground">
						{summary.played} played · {summary.planned} planned · {summary.availableTeams} of{' '}
						{summary.totalTeams} teams available
					</div>
				</div>
				<div className="flex gap-3 text-[10px] text-muted-foreground">
					<Legend colour="bg-[var(--alive)]" label="Win" />
					<Legend colour="bg-[var(--eliminated)]" label="Loss" />
					<Legend colour="bg-[#7c3aed]" label="Planned" />
				</div>
			</div>
			<div className="flex gap-1 overflow-x-auto py-1">
				{slots.map((s) => (
					<Slot key={s.roundId} slot={s} />
				))}
			</div>
		</div>
	)
}

function Legend({ colour, label }: { colour: string; label: string }) {
	return (
		<span className="flex items-center gap-1">
			<span className={cn('h-2 w-2 rounded-full', colour)} />
			{label}
		</span>
	)
}

function Slot({ slot }: { slot: ChainSlot }) {
	const s = slot.state
	const wrapperClass = cn(
		'flex-none w-[54px] text-center px-1 py-1.5 rounded-md border bg-card',
		s.kind === 'win' && 'bg-[var(--alive-bg)] border-[var(--alive)]',
		s.kind === 'loss' && 'bg-[var(--eliminated-bg)] border-[var(--eliminated)]',
		s.kind === 'draw' && 'bg-[var(--draw-bg)] border-[var(--draw)]',
		s.kind === 'current' && 'border-2 border-[var(--alive)] shadow-[inset_0_0_0_1px_var(--alive)]',
		s.kind === 'planned' && 'border-2 border-dashed border-[#7c3aed] bg-[#f5f3ff]',
		s.kind === 'planned-locked' && 'border-2 border-[#7c3aed] bg-[#ede9fe]',
		s.kind === 'empty' && 'border-dashed text-muted-foreground',
		s.kind === 'tbc' && 'border-dashed opacity-55',
	)
	return (
		<div className={wrapperClass}>
			<div className="text-[9px] uppercase text-muted-foreground">{slot.roundLabel}</div>
			{'teamShort' in s && s.teamShort ? (
				<div
					className="mx-auto mt-1 h-7 w-7 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
					style={{ backgroundColor: s.teamColour ?? '#888' }}
				>
					{s.teamShort}
				</div>
			) : (
				<div className="mt-1 text-base opacity-50">?</div>
			)}
			{s.kind === 'planned-locked' && (
				<div className="text-[7px] font-bold text-[#7c3aed] mt-0.5">AUTO</div>
			)}
		</div>
	)
}
