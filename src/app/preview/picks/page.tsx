import {
	CLASSIC_CARDS,
	CLASSIC_SIDE_STATES,
	CUP_CARDS,
	FORM_PANEL_MARKET,
	FORM_PANEL_MARKET_LONGSHOT,
	PICK_TABLE_SCENARIOS,
	PLANNER_FIXTURES,
	RANKED_LIST_FIXTURES,
	ROW_FIXTURES,
	TEAM_FORM_DETAIL,
	TEAM_FORM_DETAIL_EMPTY,
	TURBO_SCENARIOS,
	TURBO_TABLE_SCENARIOS,
} from '@/app/preview/picks/fixtures'
import {
	PreviewClassicPick,
	PreviewCupPick,
	PreviewFixtureRow,
	PreviewPickTable,
	PreviewPlannerRound,
	type PreviewPlannerRoundInput,
	PreviewRankedList,
	PreviewTurboPick,
	PreviewTurboPickTable,
} from '@/app/preview/picks/picks-demo'
import { TeamFormPanel } from '@/components/picks/team-form-panel'
import { cn } from '@/lib/utils'

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

/**
 * The phone column: a viewport width minus the game page's own `px-4`.
 *
 * 375px is the common iPhone width and the default here; 360px is the narrowest
 * Android in real use, and the Table view is reviewed at both because it now
 * has to fit without scrolling sideways.
 */
const PHONE_WIDTHS = { 375: 'w-[375px]', 360: 'w-[360px]' } as const

function MobileColumn({
	children,
	width = 375,
}: {
	children: React.ReactNode
	width?: keyof typeof PHONE_WIDTHS
}) {
	return (
		<div
			className={cn(
				PHONE_WIDTHS[width],
				'max-w-full shrink-0 rounded-lg border border-dashed border-border/70 p-1',
			)}
		>
			<div className="text-2xs uppercase tracking-wide text-muted-foreground/70 mb-1 px-1">
				{width}px
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
					states, picker card and Table view, turbo's whole picker — its ranked list, its
					remaining-fixtures list, each state of its submission, and the Table view as its ranking
					board — and cup's picker card. Hand-built fixtures, no auth, no database.
				</p>
				<p>
					Nothing here renders a round title or a deadline: on the real page the game hero sits
					directly above the picker and owns both.
				</p>
				<p>
					Every row renders twice: full page width, then in a 375px column — and the two Table views
					a third time at 360px, the narrowest phone they have to fit without scrolling sideways.
					The narrow columns are a <em>width</em> constraint, so they catch truncation and overflow
					— to also get the mobile type step and short team codes, set the browser viewport itself
					to that width.
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
							<PreviewFixtureRow
								fixture={f}
								kickoff={at(now, f.kickoffInMinutes)}
								oddsAsOf={at(now, f.odds?.asOfInMinutes)}
							/>
						</div>
						<MobileColumn>
							<PreviewFixtureRow
								fixture={f}
								kickoff={at(now, f.kickoffInMinutes)}
								oddsAsOf={at(now, f.odds?.asOfInMinutes)}
							/>
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
							<PreviewFixtureRow
								fixture={f}
								kickoff={at(now, f.kickoffInMinutes)}
								oddsAsOf={at(now, f.odds?.asOfInMinutes)}
							/>
						</div>
						<MobileColumn>
							<PreviewFixtureRow
								fixture={f}
								kickoff={at(now, f.kickoffInMinutes)}
								oddsAsOf={at(now, f.odds?.asOfInMinutes)}
							/>
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
					competitionType: c.competitionType,
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

			<GroupHeading title="Classic — the Table view">
				The other half of the picker: the same round as a standings board, one row per team the
				player could pick, five columns wide and opening in league order. Team and win chance
				re-sort it; form and next opponent are labels, because neither carries an order a player
				asks for. The used and restricted teams stay in the table rather than disappearing from it,
				a row tap <em>selects</em> a team (the picker's confirm bar commits it — see the cards
				above), and the form cell's chevron taps through to the same sheet the Fixtures view opens.
				In the app a league opens on this view and a knockout on the fixtures — with no standings
				behind the round at all, the toggle isn't offered.
			</GroupHeading>

			{PICK_TABLE_SCENARIOS.map((s) => {
				const fixtures = s.fixtures.map((f) => ({
					id: f.id,
					home: f.home,
					away: f.away,
					kickoff: at(now, f.kickoffInMinutes),
					odds: f.odds
						? {
								home: f.odds.home,
								draw: f.odds.draw,
								away: f.odds.away,
								asOf: at(now, f.odds.asOfInMinutes) as string,
							}
						: null,
				}))
				return (
					<section key={s.id} className="space-y-2">
						<header>
							<h2 className="font-display text-sm font-semibold">{s.title}</h2>
							{s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
						</header>
						<div className="flex flex-wrap items-start gap-4">
							<div className="flex-1 min-w-[320px]">
								<PreviewPickTable
									fixtures={fixtures}
									usedTeamsByRound={s.usedTeamsByRound}
									restrictedTeams={s.restrictedTeams}
									currentTeamId={s.currentTeamId}
									readonly={s.readonly}
								/>
							</div>
							{/* Both phone widths: the board fits five columns with no
							    horizontal scroll and no pinned column, so this is where that
							    is measured — 360px is the one that has to hold. */}
							{([375, 360] as const).map((width) => (
								<MobileColumn key={width} width={width}>
									<PreviewPickTable
										fixtures={fixtures}
										usedTeamsByRound={s.usedTeamsByRound}
										restrictedTeams={s.restrictedTeams}
										currentTeamId={s.currentTeamId}
										readonly={s.readonly}
									/>
								</MobileColumn>
							))}
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

			<GroupHeading title="Turbo — ranking from the Table">
				The other half of turbo's picker: the same board classic picks from, with the last column
				asking a different question — a tap adds the team to the confidence set at the next rank,
				and a row already in the set carries the controls for its place in it. The confidence list
				stays above the board (it owns drag-reorder, the prediction change and the draw, which a
				board of teams can't express); what's here is the board, at the width it has to survive.
			</GroupHeading>

			{TURBO_TABLE_SCENARIOS.map((s) => {
				const fixtures = s.fixtures.map((f) => ({
					id: f.id,
					home: f.home,
					away: f.away,
					kickoff: at(now, f.kickoffInMinutes),
					odds: f.odds
						? {
								home: f.odds.home,
								draw: f.odds.draw,
								away: f.odds.away,
								asOf: at(now, f.odds.asOfInMinutes) as string,
							}
						: null,
				}))
				return (
					<section key={s.id} className="space-y-2">
						<header>
							<h2 className="font-display text-sm font-semibold">{s.title}</h2>
							{s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
						</header>
						<div className="flex flex-wrap items-start gap-4">
							<div className="flex-1 min-w-[320px]">
								<PreviewTurboPickTable
									fixtures={fixtures}
									numberOfPicks={s.numberOfPicks}
									ranking={s.ranking}
									readonly={s.readonly}
								/>
							</div>
							{/* Both phone widths: turbo's board carries a sixth column the
							    rank chip and three controls live in, so it's the tightest
							    the board gets. */}
							{([375, 360] as const).map((width) => (
								<MobileColumn key={width} width={width}>
									<PreviewTurboPickTable
										fixtures={fixtures}
										numberOfPicks={s.numberOfPicks}
										ranking={s.ranking}
										readonly={s.readonly}
									/>
								</MobileColumn>
							))}
						</div>
					</section>
				)
			})}

			<GroupHeading title="Cup — the picker card">
				<code>CupPick</code>, which reaches the shared row through the same <code>FixtureRow</code>{' '}
				classic uses — so the legibility and type-scale work lands here with no cup-specific code.
				Two things to look at: the deadline strip and the “rank N picks” line are gone (the hero
				above owns both), and the rows carry no form or league position, because a cup team’s form
				lives in its league rather than the cup — a cross-competition problem left to the FA-Cup
				effort.
			</GroupHeading>

			{CUP_CARDS.map((c) => {
				const card = {
					numberOfPicks: c.numberOfPicks,
					livesRemaining: c.livesRemaining,
					maxLives: c.maxLives,
					fixtures: c.fixtures.map(({ kickoffInMinutes, ...f }) => ({
						...f,
						kickoff: at(now, kickoffInMinutes),
					})),
					initialSlots: c.initialSlots,
					readonly: c.readonly,
				}
				return (
					<section key={c.id} className="space-y-2">
						<header>
							<h2 className="font-display text-sm font-semibold">{c.title}</h2>
							{c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
						</header>
						<div className="flex flex-wrap items-start gap-4">
							<div className="flex-1 min-w-[320px]">
								<PreviewCupPick card={card} />
							</div>
							<MobileColumn>
								<PreviewCupPick card={card} />
							</MobileColumn>
						</div>
					</section>
				)
			})}

			<GroupHeading title="Form detail">
				The sheet every form bar above taps through to — the enriched one: recent form split into
				home and away with goals for and against, and the full home/draw/away market the row itself
				only shows two-thirds of. The market comes down with the row rather than from the form
				query, so it's on screen while the form is still loading, and it survives a form failure.
			</GroupHeading>

			{FORM_PANEL_STATES.map((s) => (
				<section key={s.id} className="space-y-2">
					<header>
						<h2 className="font-display text-sm font-semibold">{s.label}</h2>
						<p className="text-xs text-muted-foreground">{s.note}</p>
					</header>
					<div className="flex flex-wrap items-start gap-4">
						<div className="flex-1 min-w-[320px] rounded-lg border border-border bg-card py-3">
							<TeamFormPanel {...s.props} />
						</div>
						<MobileColumn>
							<div className="rounded-lg border border-border bg-card py-3">
								<TeamFormPanel {...s.props} />
							</div>
						</MobileColumn>
					</div>
				</section>
			))}
		</div>
	)
}

/**
 * The panel is the presentational half split out of `TeamFormSheet` — the sheet
 * itself loads through a database-backed server action, so the gallery renders
 * the panel inline from fixtures. Tapping either half of any form bar above shows
 * the same content inside the real sheet.
 */
const FORM_PANEL_STATES: Array<{
	id: string
	label: string
	note: string
	props: React.ComponentProps<typeof TeamFormPanel>
}> = [
	{
		id: 'enriched',
		label: 'Loaded — split, goals, full 1X2',
		note: 'Everything the picker gets before committing: the venue split (this team is a fortress at home and ordinary away, which the aggregate row hides), goals for and against per venue, the last matches, the head-to-head, and the whole market including the draw — the outcome that eliminates a classic picker.',
		props: {
			detail: TEAM_FORM_DETAIL,
			market: FORM_PANEL_MARKET,
			teamPreview: { name: 'Manchester United', shortName: 'MUN' },
			opponentPreview: { shortName: 'NEW' },
		},
	},
	{
		id: 'unpriced',
		label: 'Loaded — unpriced fixture',
		note: 'The same sheet for a fixture nobody quotes (or a competition we have no odds for): the form half is untouched and there is no market block at all — no zeroes, no placeholder, exactly as the row shows no probability.',
		props: {
			detail: TEAM_FORM_DETAIL,
			teamPreview: { name: 'Manchester United', shortName: 'MUN' },
			opponentPreview: { shortName: 'NEW' },
		},
	},
	{
		id: 'empty',
		label: 'Season start — nothing played, market priced',
		note: 'Nothing to split yet: every venue reads zero, with a dash where the form string would be. The market is still there — bookmakers price GW1 — and here it is the away side that is the sheet team, so the marked row is the away one, at the widest the percentage and price columns get.',
		props: {
			detail: TEAM_FORM_DETAIL_EMPTY,
			market: FORM_PANEL_MARKET_LONGSHOT,
			teamPreview: { name: 'Wolverhampton Wanderers', shortName: 'WOL' },
			opponentPreview: { shortName: 'ARS' },
		},
	},
	{
		id: 'loading',
		label: 'Loading — market already on screen',
		note: 'The form is still in flight; the market was already on the row the viewer tapped, so it renders immediately rather than waiting on a query it does not depend on.',
		props: {
			detail: null,
			loading: true,
			market: FORM_PANEL_MARKET,
			teamPreview: { name: 'Manchester United', shortName: 'MUN' },
			opponentPreview: { shortName: 'NEW' },
		},
	},
	{
		id: 'error',
		label: 'Failed — market survives',
		note: 'The form query failed. The market still shows, for the same reason: it never came from that query.',
		props: {
			detail: null,
			error: 'Could not load team form',
			market: FORM_PANEL_MARKET,
			teamPreview: { name: 'Manchester United', shortName: 'MUN' },
			opponentPreview: { shortName: 'NEW' },
		},
	},
]
