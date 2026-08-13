import {
	CLASSIC_ONLY_SUMMARY,
	FULL_HISTORY_SUMMARY,
	MID_SEASON_START_SUMMARY,
} from '@/app/preview/me-summary/fixtures'
import { PlayerSummaryView } from '@/components/me/player-summary-view'

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

export default function MeSummaryPreviewPage() {
	return (
		<div className="space-y-10">
			<div className="space-y-2 text-sm text-muted-foreground">
				<p>
					The player's own summary page (<code>/me</code>) — the career headline, rendered from a
					hand-built view model. No auth, no database, and no player id anywhere: the real page
					reads its player from the session.
				</p>
			</div>

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">Full history</h2>
				<p className="text-sm text-muted-foreground">
					Several seasons in: games played and won, the win rate, pick accuracy over the picks that
					settled (with the four a cup life absorbed noted rather than counted), and the most-picked
					club — then a section per mode, each with its competition rows: classic's rounds survived
					and its round one (a survival rate, the opening picks that went down, and the two of the
					three of those that offered a rebuy they bought back into), and turbo's and cup's streaks
					(the same numbers those games were decided by).
				</p>
			</header>
			<PlayerSummaryView summary={FULL_HISTORY_SUMMARY} />
			<MobileColumn>
				<PlayerSummaryView summary={FULL_HISTORY_SUMMARY} />
			</MobileColumn>

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">Classic only, one turbo game in play</h2>
				<p className="text-sm text-muted-foreground">
					The absences: cup states that it hasn't been played rather than showing a record of
					noughts, turbo has a game behind it but no completed one — so it has a record and no
					streak to average yet — and classic's round one has never gone down, so its rebuy figure
					says none was on offer rather than showing a nought.
				</p>
			</header>
			<PlayerSummaryView summary={CLASSIC_ONLY_SUMMARY} />
			<MobileColumn>
				<PlayerSummaryView summary={CLASSIC_ONLY_SUMMARY} />
			</MobileColumn>

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">One game, started mid-season</h2>
				<p className="text-sm text-muted-foreground">
					A game created after gameweek one's deadline starts at the competition's earliest pickable
					round, so it has no round one — and neither does the record of it. The survival rate is a
					dash over a game it has nothing to say about, rather than a nought for a hurdle the player
					was never put to. A round one that hasn't kicked off yet reads the same way.
				</p>
			</header>
			<PlayerSummaryView summary={MID_SEASON_START_SUMMARY} />
			<MobileColumn>
				<PlayerSummaryView summary={MID_SEASON_START_SUMMARY} />
			</MobileColumn>
		</div>
	)
}
