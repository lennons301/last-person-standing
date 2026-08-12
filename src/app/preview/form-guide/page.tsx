import {
	EARLY_SEASON_GUIDE,
	EMPTY_GUIDE,
	FULL_GUIDE,
	NO_OPPONENT_GUIDE,
	OPENING_WEEKEND_GUIDE,
} from '@/app/preview/form-guide/fixtures'
import { FormGuideView } from '@/components/picks/form-guide'

/** A banner between gallery entries, matching `/preview/picks`. */
function GroupHeading({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<header className="border-t border-border pt-6">
			<h2 className="font-display text-lg font-semibold">{title}</h2>
			<p className="text-sm text-muted-foreground">{children}</p>
		</header>
	)
}

/** The phone column: 375px of viewport minus the page's own `px-4`. */
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

export default function FormGuidePreviewPage() {
	return (
		<div className="space-y-10">
			<div className="space-y-2 text-sm text-muted-foreground">
				<p>
					The full form guide — the deep dive behind the pick selector's form sheet. Scoped to a
					competition, not a game: the same page for everyone playing it, whichever game they came
					from. Hand-built fixtures, no auth, no database.
				</p>
				<p>
					The position line comes from the per-matchday standings snapshot, which accumulates from
					deployment onward with no backfill. The sparse states below are therefore the normal early
					states, not error states — each has to read as intentional.
				</p>
			</div>

			<GroupHeading title="From a pick, mid-season">
				Everything present: a twelve-matchday position line, home/away splits, goals per game, a
				priced next fixture, head-to-head against the opponent whose fixture was open, and the full
				results list.
			</GroupHeading>
			<FormGuideView guide={FULL_GUIDE} backHref="/game/preview" backLabel="Back to game" />
			<MobileColumn>
				<FormGuideView guide={FULL_GUIDE} backHref="/game/preview" backLabel="Back to game" />
			</MobileColumn>

			<GroupHeading title="Opened from a badge (no opponent)">
				No fixture in mind, so no head-to-head section at all — and no back link, as on a shared
				URL.
			</GroupHeading>
			<FormGuideView guide={NO_OPPONENT_GUIDE} />

			<GroupHeading title="Early season">
				Two matchdays in: one result, a two-point line, a next fixture we hold no odds for, and an
				opponent this team hasn't met yet.
			</GroupHeading>
			<FormGuideView guide={EARLY_SEASON_GUIDE} backHref="/game/preview" />
			<MobileColumn>
				<FormGuideView guide={EARLY_SEASON_GUIDE} backHref="/game/preview" />
			</MobileColumn>

			<GroupHeading title="Opening weekend, before this team has played">
				The league has started but this team hasn't kicked off yet: a real position in a full table
				("14th of 20", never "14th of 2"), no line yet, a priced opener. The state the per-matchday
				snapshot ships into on day one.
			</GroupHeading>
			<FormGuideView guide={OPENING_WEEKEND_GUIDE} backHref="/game/preview" />
			<MobileColumn>
				<FormGuideView guide={OPENING_WEEKEND_GUIDE} backHref="/game/preview" />
			</MobileColumn>

			<GroupHeading title="Season start, nothing recorded">
				No results, no snapshot, no position, no odds, no kickoff time. Every section states what it
				doesn't know instead of rendering blank.
			</GroupHeading>
			<FormGuideView guide={EMPTY_GUIDE} />
		</div>
	)
}
