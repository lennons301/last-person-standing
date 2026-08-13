import {
	CLASSIC_ONLY_SUMMARY,
	FILTERED_SEASON_SUMMARY,
	FREE_GAMES_ONLY_MONEY,
	FULL_HISTORY_MONEY,
	FULL_HISTORY_SUMMARY,
} from '@/app/preview/me-summary/fixtures'
import { MoneyPanel } from '@/components/me/money-panel'
import { MoneySection } from '@/components/me/money-section'
import { PlayerSummaryView } from '@/components/me/player-summary-view'
import { SettingsFold } from '@/components/me/settings-fold'

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

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">Money, shut and open</h2>
				<p className="text-sm text-muted-foreground">
					The fold is closed on every page above, which is the state a player lands on: most people
					lose, so the figure is one they ask for. Below it is closed again on its own, then the
					panel it hides — the presentational half, rendered straight, which is how the opened state
					gets reviewed without a click. The history's numbers: nine games, £80.00 staked (a rebuy
					counted twice, an entry only marked paid counted all the same, a wiped-out game's stakes
					refunded to nothing) against £66.50 won across three wins, two of them shared — so the
					headline is the loss most players are looking at. The free World Cup game is named as
					unlisted rather than shown as a game that cost nothing and lost. Then the same panel for a
					player who has only ever played for nothing.
				</p>
			</header>
			<MoneySection money={FULL_HISTORY_MONEY} />
			<div className="rounded-lg border border-border bg-card overflow-hidden">
				<MoneyPanel money={FULL_HISTORY_MONEY} />
			</div>
			<MobileColumn>
				<div className="rounded-lg border border-border bg-card overflow-hidden">
					<MoneyPanel money={FULL_HISTORY_MONEY} />
				</div>
			</MobileColumn>
			<div className="rounded-lg border border-border bg-card overflow-hidden">
				<MoneyPanel money={FREE_GAMES_ONLY_MONEY} />
			</div>

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">Settings fold</h2>
				<p className="text-sm text-muted-foreground">
					What closes the page, below the summary and the money fold alike: the payment handle's
					permanent home, so a player who has only ever joined games can still set where they'll be
					paid. Collapsed as it renders on the page (first), then opened in both states the setting
					has — a handle saved, and none saved at all, which is the state that says what happens
					instead. The control inside is the same one the admin Payments panel renders, saving
					through the same endpoint.
				</p>
			</header>
			<SettingsFold paymentProvider="monzo" paymentHandle="alicejones" />
			<SettingsFold paymentProvider="monzo" paymentHandle="alicejones" defaultOpen />
			<SettingsFold paymentProvider={null} paymentHandle={null} defaultOpen />
			<MobileColumn>
				<SettingsFold paymentProvider="revolut" paymentHandle="bobsmith" defaultOpen />
			</MobileColumn>
		</div>
	)
}
