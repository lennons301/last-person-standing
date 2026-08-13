import {
	CLASSIC_ONLY_SUMMARY,
	FILTERED_SEASON_SUMMARY,
	FULL_HISTORY_SUMMARY,
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
					The player's own summary page (<code>/me</code>) — rendered from a hand-built history run
					through the real builder, so no figure on the page is hand-totalled. No auth, no database,
					and no player id anywhere: the real page reads its player from the session.
				</p>
			</div>

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">Full history</h2>
				<p className="text-sm text-muted-foreground">
					Nine games over two Premier League seasons and one World Cup. The headline: games played
					and won, the win rate, pick accuracy over the picks that settled (with the two a cup life
					absorbed noted rather than counted), and the most-picked club. Then a section per mode,
					each with its competition rows: classic's rounds survived, and turbo's and cup's streaks
					(the same numbers those games were decided by). The Teams section closes the page, one
					block per competition family — the two league seasons pooled into one ranking (Liverpool's
					five picks can't come from a single season) and the World Cup standing separately, never
					merged into it. England carries a pick a life absorbed alongside its rate; Italy, whose
					only pick a life absorbed, has no rate at all and so appears in neither end while still
					being listed in the expansion.
				</p>
			</header>
			<PlayerSummaryView summary={FULL_HISTORY_SUMMARY} />
			<MobileColumn>
				<PlayerSummaryView summary={FULL_HISTORY_SUMMARY} />
			</MobileColumn>

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">A season selected, per family</h2>
				<p className="text-sm text-muted-foreground">
					The same history, arrived at through a link. Each family block carries its own season
					control — a league season reads "2025/26" where a World Cup reads "2026", so one control
					over both would offer seasons that mean nothing to half the teams under it. The league
					block is narrowed to 2025/26 (Liverpool's five picks drop to that season's three) and
					still offers the season it narrowed away from; the World Cup is narrowed to an edition
					this player never played — what a link shared by a player with a different history does —
					so it names the empty season rather than showing a record of noughts. Above them, the
					headline and the mode sections are unmoved: they are all-time whatever is selected here.
				</p>
			</header>
			<PlayerSummaryView summary={FILTERED_SEASON_SUMMARY} />
			<MobileColumn>
				<PlayerSummaryView summary={FILTERED_SEASON_SUMMARY} />
			</MobileColumn>

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">Classic only, one turbo game in play</h2>
				<p className="text-sm text-muted-foreground">
					The absences: cup states that it hasn't been played rather than showing a record of
					noughts, and turbo has a game behind it but no completed one — so it has a record and no
					streak to average yet.
				</p>
			</header>
			<PlayerSummaryView summary={CLASSIC_ONLY_SUMMARY} />
			<MobileColumn>
				<PlayerSummaryView summary={CLASSIC_ONLY_SUMMARY} />
			</MobileColumn>
		</div>
	)
}
