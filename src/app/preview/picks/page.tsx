import {
	CLASSIC_CARDS,
	CLASSIC_SIDE_STATES,
	PLANNER_FIXTURES,
	RANKED_LIST_FIXTURES,
	ROW_FIXTURES,
	TEAM_FORM_DETAIL,
	TEAM_FORM_DETAIL_EMPTY,
	TURBO_SCENARIOS,
} from '@/app/preview/picks/fixtures'
import {
	PreviewClassicPick,
	PreviewFixtureRow,
	PreviewPlannerRound,
	type PreviewPlannerRoundInput,
	PreviewRankedList,
	PreviewTurboPick,
} from '@/app/preview/picks/picks-demo'
import { TeamFormPanel } from '@/components/picks/team-form-panel'

// Fixtures are relative to render time, so never cache this page.
export const dynamic = 'force-dynamic'

function at(now: Date, minutes: number | null | undefined): string | null {
	if (minutes == null) return null
	return new Date(now.getTime() + minutes * 60_000).toISOString()
}

/** A banner between gallery groups, so "shared row" and "classic" don't blur. */
function GroupHeading({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<header className="border-t border-border pt-6">
			<h2 className="font-display text-lg font-semibold">{title}</h2>
			<p className="text-sm text-muted-foreground">{children}</p>
		</header>
	)
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
					form-detail panel that hangs off it. Then a section per mode: classic's planner, side
					states and picker card, and turbo's whole picker — its ranked list, its remaining-fixtures
					list, and each state of its submission. Hand-built fixtures, no auth, no database.
				</p>
				<p>
					Nothing here renders a round title or a deadline: on the real page the game hero sits
					directly above the picker and owns both.
				</p>
				<p>
					Every row renders twice: full page width, then in a 375px column. The narrow column is a
					<em> width</em> constraint, so it catches truncation and overflow — to also get the mobile
					type step and short team codes, set the browser viewport itself to 375px.
				</p>
			</div>

			<GroupHeading title="Shared row">
				Every state <code>FixtureRow</code> renders, whichever mode drives it.
			</GroupHeading>

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

			<GroupHeading title="Classic — the planner">
				Classic's future-round planner, at the nesting depth the real page gives it. Form dots,
				league position and the tap-through to the form sheet are new here: the planner used to pass
				none of them, so a future pick was decided with less than the current round offered.
			</GroupHeading>

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

			<GroupHeading title="Classic — side states">
				One row per <code>SideState</code>, in the wording classic puts on each, plus the two rows
				classic has to get right on its own: a fixture with both teams spent, and a season-start
				round with no form anywhere.
			</GroupHeading>

			{CLASSIC_SIDE_STATES.map((f) => (
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

			<GroupHeading title="Classic — the picker card">
				<code>ClassicPick</code> as a whole, in each state it moves through. What's worth looking at
				is what <em>isn't</em> here: the round name and the deadline belong to the game hero
				directly above this card on the real page, so the expanded picker no longer repeats them.
			</GroupHeading>

			{CLASSIC_CARDS.map((c) => {
				const planner = PLANNER_FIXTURES.filter((p) => p.id === c.plannerSetId)
				const card = (idSuffix: string) => ({
					roundName: c.roundName,
					roundNumber: c.roundNumber,
					deadline: at(now, c.deadlineInMinutes),
					fixtures: c.fixtures.map((f) => ({
						id: f.id,
						home: f.home,
						away: f.away,
						kickoff: at(now, f.kickoffInMinutes),
					})),
					usedTeamsByRound: c.usedTeamsByRound,
					existingPickTeamId: c.existingPickTeamId,
					existingPickFixtureId: c.existingPickFixtureId,
					currentRoundClosed: c.currentRoundClosed,
					summaryInHero: c.summaryInHero,
					startExpanded: c.startExpanded,
					planner: planner.map(
						(p): PreviewPlannerRoundInput => ({
							roundId: `${p.id}-${idSuffix}`,
							roundNumber: p.roundNumber,
							roundName: p.roundName,
							roundLabel: p.roundLabel,
							deadline: at(now, p.deadlineInMinutes),
							fixturesTbc: p.fixturesTbc,
							fixtures: p.fixtures.map((f) => ({ ...f, kickoff: at(now, f.kickoffInMinutes) })),
							usedTeams: p.usedTeams,
							lockedTeamId: p.lockedTeamId,
						}),
					),
				})
				return (
					<section key={c.id} className="space-y-2">
						<header>
							<h2 className="font-display text-sm font-semibold">{c.title}</h2>
							{c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
						</header>
						<div className="flex flex-wrap items-start gap-4">
							<div className="flex-1 min-w-[320px]">
								<PreviewClassicPick card={card('wide')} />
							</div>
							<MobileColumn>
								<PreviewClassicPick card={card('mobile')} />
							</MobileColumn>
						</div>
					</section>
				)
			})}

			<GroupHeading title="Turbo — the ranked rows">
				A ranked row on its own, at the confidence positions that change its shape.
			</GroupHeading>

			{RANKED_LIST_FIXTURES.map((f) => (
				<section key={f.id} className="space-y-2">
					<header>
						<h2 className="font-display text-sm font-semibold">{f.title}</h2>
						{f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
					</header>
					<div className="flex flex-wrap items-start gap-4">
						<div className="flex-1 min-w-[320px]">
							<PreviewRankedList fixture={f} />
						</div>
						<MobileColumn>
							<PreviewRankedList fixture={f} />
						</MobileColumn>
					</div>
				</section>
			))}

			<GroupHeading title="Turbo — the picker">
				<code>TurboPick</code> as a whole, in each state of its submission: nothing ranked, partly
				ranked, fully ranked, unsaved changes, and a season start with no form anywhere.
			</GroupHeading>

			{TURBO_SCENARIOS.map((s) => (
				<section key={s.id} className="space-y-2">
					<header>
						<h2 className="font-display text-sm font-semibold">{s.title}</h2>
						{s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
					</header>
					{/* `transform-gpu` makes each scenario box the containing block for the
					    picker's own `fixed` confirm bar, so five pickers on one page don't
					    stack five bars at the bottom of the viewport on mobile widths. */}
					<div className="transform-gpu relative overflow-hidden rounded-lg border border-dashed border-border/70 p-4">
						<PreviewTurboPick
							scenario={s}
							fixtures={s.fixtures.map((f) => ({ id: f.id, kickoff: at(now, f.kickoffInMinutes) }))}
						/>
					</div>
				</section>
			))}

			<GroupHeading title="Form detail">
				The sheet every form bar above taps through to.
			</GroupHeading>

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
