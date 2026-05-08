'use client'

import { useState } from 'react'
import { LocalDateTime } from '@/components/local-datetime'
import { cn } from '@/lib/utils'
import { FixtureRow } from './fixture-row'

export interface PlannerFixture {
	id: string
	homeTeam: {
		id: string
		short: string
		name: string
		colour: string | null
		badgeUrl: string | null
	}
	awayTeam: {
		id: string
		short: string
		name: string
		colour: string | null
		badgeUrl: string | null
	}
	kickoff: Date | null
}

export interface UsedInfo {
	teamId: string
	label: string // e.g. "USED GW3" or "PLANNED GW27"
	kind: 'used' | 'planned-elsewhere'
}

interface PlannerRoundProps {
	roundId: string
	roundNumber: number
	roundName: string
	roundLabel: string
	deadline: Date | null
	fixturesTbc: boolean
	fixtures: PlannerFixture[]
	usedTeams: UsedInfo[]
	plannedTeamId: string | null
	plannedAutoSubmit: boolean
	onPlan: (roundId: string, teamId: string, autoSubmit: boolean) => Promise<void>
	onRemove: (roundId: string) => Promise<void>
	onToggleAuto: (roundId: string, autoSubmit: boolean) => Promise<void>
}

export function PlannerRound(props: PlannerRoundProps) {
	const [pending, setPending] = useState(false)
	if (props.fixturesTbc) {
		return (
			<div className="rounded-xl border border-border bg-muted/30 px-3 py-3 opacity-55">
				<div className="flex justify-between items-center">
					<div className="font-semibold text-sm">{props.roundLabel} · Fixtures TBC</div>
					<span className="text-[11px] text-muted-foreground">
						Planner unlocks when fixtures are published
					</span>
				</div>
			</div>
		)
	}
	return (
		<div className="rounded-xl border border-border bg-card px-3 py-3">
			<div className="flex justify-between items-center mb-2">
				<div>
					<div className="font-semibold text-sm">
						{props.roundLabel} · {props.roundName}
					</div>
					{props.deadline && (
						<div className="text-[11px] text-muted-foreground">
							Deadline{' '}
							<LocalDateTime
								date={props.deadline}
								options={{ weekday: 'short', day: 'numeric', month: 'short' }}
							/>
						</div>
					)}
				</div>
				<label
					className={cn(
						'flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer',
						pending && 'opacity-50',
					)}
				>
					<span>Auto-submit</span>
					<input
						type="checkbox"
						className="sr-only peer"
						checked={props.plannedAutoSubmit}
						disabled={pending || !props.plannedTeamId}
						onChange={async (e) => {
							setPending(true)
							try {
								await props.onToggleAuto(props.roundId, e.target.checked)
							} finally {
								setPending(false)
							}
						}}
					/>
					<span className="relative w-7 h-4 bg-muted rounded-full peer-checked:bg-[#7c3aed]">
						<span className="absolute top-[2px] left-[2px] w-3 h-3 bg-white rounded-full transition-all peer-checked:left-[14px]" />
					</span>
				</label>
			</div>
			{props.fixtures.map((f) => {
				const homeUsed = props.usedTeams.find((u) => u.teamId === f.homeTeam.id)
				const awayUsed = props.usedTeams.find((u) => u.teamId === f.awayTeam.id)
				const homeIsPlan = f.homeTeam.id === props.plannedTeamId
				const awayIsPlan = f.awayTeam.id === props.plannedTeamId
				const planKind: 'auto-locked' | 'tentative' = props.plannedAutoSubmit
					? 'auto-locked'
					: 'tentative'
				return (
					<FixtureRow
						key={f.id}
						home={{
							id: f.homeTeam.id,
							shortName: f.homeTeam.short,
							name: f.homeTeam.name,
							badgeUrl: f.homeTeam.badgeUrl,
						}}
						away={{
							id: f.awayTeam.id,
							shortName: f.awayTeam.short,
							name: f.awayTeam.name,
							badgeUrl: f.awayTeam.badgeUrl,
						}}
						kickoff={f.kickoff ?? undefined}
						homeState={
							homeIsPlan
								? { kind: planKind }
								: homeUsed
									? { kind: homeUsed.kind, label: homeUsed.label }
									: undefined
						}
						awayState={
							awayIsPlan
								? { kind: planKind }
								: awayUsed
									? { kind: awayUsed.kind, label: awayUsed.label }
									: undefined
						}
						onPickHome={
							homeUsed
								? undefined
								: () => props.onPlan(props.roundId, f.homeTeam.id, props.plannedAutoSubmit)
						}
						onPickAway={
							awayUsed
								? undefined
								: () => props.onPlan(props.roundId, f.awayTeam.id, props.plannedAutoSubmit)
						}
					/>
				)
			})}
			{props.plannedTeamId && (
				<button
					type="button"
					className="mt-2 text-[11px] text-muted-foreground underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
					onClick={() => props.onRemove(props.roundId)}
				>
					Clear plan
				</button>
			)}
		</div>
	)
}
