import {
	PLANNER_FIXTURES,
	ROW_FIXTURES,
	TEAM_FORM_DETAIL,
	TEAM_FORM_DETAIL_EMPTY,
} from '@/app/preview/picks/fixtures'
import { PreviewFixtureRow, PreviewPlannerRound } from '@/app/preview/picks/picks-demo'
import { TeamFormPanel } from '@/components/picks/team-form-panel'

// Fixtures are relative to render time, so never cache this page.
export const dynamic = 'force-dynamic'

function at(now: Date, minutes: number | null | undefined): string | null {
	if (minutes == null) return null
	return new Date(now.getTime() + minutes * 60_000).toISOString()
}

/** The phone column: 375px of viewport minus the game page's own `px-4`. */
function MobileColumn({ children }: { children: React.ReactNode }) {
	return (
		<div className="w-[375px] max-w-full shrink-0 rounded-lg border border-dashed border-border/70 p-1">
			<div className="text-2xs uppercase tracking-wide text-muted-foreground/70 mb-1 px-1">
				375px
			</div>
			<div className="px-4">{children}</div>
		</div>
	)
}

export default function PicksPreviewPage() {
	const now = new Date()

	return (
		<div className="space-y-10">
			<div className="space-y-2 text-sm text-muted-foreground">
				<p>
					The pick selector's shared foundation: <code>FixtureRow</code> — imported by classic,
					turbo, cup and the classic planner — in every state the modes can put it in, plus the
					form-detail panel that hangs off it. Hand-built fixtures, no auth, no database.
				</p>
				<p>
					Every row renders twice: full page width, then in a 375px column. The narrow column is a
					<em> width</em> constraint, so it catches truncation and overflow — to also get the mobile
					type step and short team codes, set the browser viewport itself to 375px.
				</p>
			</div>

			{ROW_FIXTURES.map((f) => (
				<section key={f.id} className="space-y-2">
					<header>
						<h2 className="font-display text-sm font-semibold">{f.title}</h2>
						{f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
					</header>
					<div className="flex flex-wrap items-start gap-4">
						<div className="flex-1 min-w-[320px]">
							<PreviewFixtureRow fixture={f} kickoff={at(now, f.kickoffInMinutes)} />
						</div>
						<MobileColumn>
							<PreviewFixtureRow fixture={f} kickoff={at(now, f.kickoffInMinutes)} />
						</MobileColumn>
					</div>
				</section>
			))}

			{PLANNER_FIXTURES.map((p) => (
				<section key={p.id} className="space-y-2">
					<header>
						<h2 className="font-display text-sm font-semibold">{p.title}</h2>
						{p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
					</header>
					<div className="flex flex-wrap items-start gap-4">
						{/* Mirrors the real nesting depth: the planner's collapsible shell
						    wraps each round card, which wraps the fixture rows. */}
						<div className="flex-1 min-w-[320px] rounded-xl border border-border bg-card p-3">
							<PreviewPlannerRound
								roundId={p.id}
								roundNumber={p.roundNumber}
								roundName={p.roundName}
								roundLabel={p.roundLabel}
								deadline={at(now, p.deadlineInMinutes)}
								fixturesTbc={p.fixturesTbc}
								fixtures={p.fixtures.map((f) => ({ ...f, kickoff: at(now, f.kickoffInMinutes) }))}
								usedTeams={p.usedTeams}
								lockedTeamId={p.lockedTeamId}
							/>
						</div>
						<MobileColumn>
							<div className="rounded-xl border border-border bg-card p-3">
								<PreviewPlannerRound
									roundId={`${p.id}-mobile`}
									roundNumber={p.roundNumber}
									roundName={p.roundName}
									roundLabel={p.roundLabel}
									deadline={at(now, p.deadlineInMinutes)}
									fixturesTbc={p.fixturesTbc}
									fixtures={p.fixtures.map((f) => ({ ...f, kickoff: at(now, f.kickoffInMinutes) }))}
									usedTeams={p.usedTeams}
									lockedTeamId={p.lockedTeamId}
								/>
							</div>
						</MobileColumn>
					</div>
				</section>
			))}

			<section className="space-y-2">
				<header>
					<h2 className="font-display text-sm font-semibold">Form detail panel</h2>
					<p className="text-xs text-muted-foreground">
						The presentational half split out of <code>TeamFormSheet</code>, rendered inline from
						fixtures. Tap either half of any form bar above to see it inside the real sheet.
					</p>
				</header>
				<div className="grid gap-4 sm:grid-cols-2">
					{[
						{ id: 'loaded', label: 'Loaded', props: { detail: TEAM_FORM_DETAIL } },
						{
							id: 'empty',
							label: 'Season start — nothing played',
							props: { detail: TEAM_FORM_DETAIL_EMPTY },
						},
						{ id: 'loading', label: 'Loading', props: { detail: null, loading: true } },
						{
							id: 'error',
							label: 'Failed',
							props: { detail: null, error: 'Could not load team form' },
						},
					].map((s) => (
						<div key={s.id} className="rounded-lg border border-border bg-card">
							<div className="text-2xs uppercase tracking-wide text-muted-foreground/70 px-4 pt-3">
								{s.label}
							</div>
							<TeamFormPanel
								{...s.props}
								teamPreview={{ name: 'Manchester United', shortName: 'MUN' }}
								opponentPreview={{ shortName: 'NEW' }}
							/>
						</div>
					))}
				</div>
			</section>
		</div>
	)
}
