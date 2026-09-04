'use client'

import { LocalDateTime } from '@/components/local-datetime'
import type { PlannerFixture, PlannerTeam, UsedInfo } from '@/lib/game/classic-planner-view'
import type { FixtureTeamInfo } from '@/lib/game/pick-view-types'
import { FixtureRow, type FormSheetRenderer } from './fixture-row'

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
	/** Remove the locked real pick for this round, freeing its team for reuse. */
	onClear: (roundId: string) => Promise<void>
	/**
	 * The competition the round belongs to. Required for the form-detail sheet —
	 * without it (or `renderFormSheet`) planner rows show form and position but
	 * don't tap through, which is the parity gap this prop closes.
	 */
	competitionId?: string
	/** Fixture-driven override for the sheet, for the database-free gallery. */
	renderFormSheet?: FormSheetRenderer
}

function teamInfo(t: PlannerTeam): FixtureTeamInfo {
	return {
		id: t.id,
		shortName: t.short,
		name: t.name,
		badgeUrl: t.badgeUrl,
		form: t.form,
		leaguePosition: t.leaguePosition ?? null,
	}
}

export function PlannerRound(props: PlannerRoundProps) {
	if (props.fixturesTbc) {
		return (
			<div className="rounded-xl border border-border bg-muted/30 px-3 py-3 opacity-55">
				<div className="flex justify-between items-center">
					<div className="font-semibold text-sm">{props.roundLabel} · Fixtures TBC</div>
					<span className="text-xs text-muted-foreground">
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
						<div className="text-xs text-muted-foreground">
							Deadline{' '}
							<LocalDateTime
								date={props.deadline}
								options={{ weekday: 'short', day: 'numeric', month: 'short' }}
							/>
						</div>
					)}
				</div>
				{props.lockedTeamId && (
					<div className="flex items-center gap-2">
						<span className="text-xs font-semibold text-[var(--alive)] uppercase tracking-wide">
							Locked in
						</span>
						<button
							type="button"
							onClick={() => props.onClear(props.roundId)}
							className="text-xs font-medium px-2 py-1 rounded-md border border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						>
							Clear
						</button>
					</div>
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
						fixtureId={f.id}
						home={teamInfo(f.homeTeam)}
						away={teamInfo(f.awayTeam)}
						competitionId={props.competitionId}
						roundNumber={props.roundNumber}
						renderFormSheet={props.renderFormSheet}
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
