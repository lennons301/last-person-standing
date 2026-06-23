'use client'

import { LocalDateTime } from '@/components/local-datetime'
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
	/** The team the player has locked in (a committed real pick) for this round. */
	lockedTeamId: string | null
	/** Commit/replace a locked real pick for this round. */
	onLock: (roundId: string, teamId: string) => Promise<void>
}

export function PlannerRound(props: PlannerRoundProps) {
	if (props.fixturesTbc) {
		return (
			<div className="rounded-xl border border-border bg-muted/30 px-3 py-3 opacity-55">
				<div className="flex justify-between items-center">
					<div className="font-semibold text-sm">{props.roundLabel} · Fixtures TBC</div>
					<span className="text-[11px] text-muted-foreground">
						Opens for picks when fixtures are published
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
				{props.lockedTeamId && (
					<span className="text-[11px] font-semibold text-[var(--alive)] uppercase tracking-wide">
						Locked in
					</span>
				)}
			</div>
			{props.fixtures.map((f) => {
				const homeUsed = props.usedTeams.find((u) => u.teamId === f.homeTeam.id)
				const awayUsed = props.usedTeams.find((u) => u.teamId === f.awayTeam.id)
				const homeIsLocked = f.homeTeam.id === props.lockedTeamId
				const awayIsLocked = f.awayTeam.id === props.lockedTeamId
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
							homeIsLocked
								? { kind: 'auto-locked' }
								: homeUsed
									? { kind: homeUsed.kind, label: homeUsed.label }
									: undefined
						}
						awayState={
							awayIsLocked
								? { kind: 'auto-locked' }
								: awayUsed
									? { kind: awayUsed.kind, label: awayUsed.label }
									: undefined
						}
						onPickHome={homeUsed ? undefined : () => props.onLock(props.roundId, f.homeTeam.id)}
						onPickAway={awayUsed ? undefined : () => props.onLock(props.roundId, f.awayTeam.id)}
					/>
				)
			})}
		</div>
	)
}
