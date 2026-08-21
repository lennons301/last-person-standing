import { ROUND_SUMMARY_CASES } from '@/app/preview/round-summary/fixtures'
import { RoundSummaryCard } from '@/components/game/round-summary-card'
import { formatRoundSummaryText } from '@/lib/game/round-summary-text'

/**
 * The post-deadline round summary, in every state the round can put it in.
 *
 * Each case is rendered twice: at full width, and in a 360px column — the phone
 * width where price-plus-probability on one line is tightest. The card is shown
 * opened (via `defaultOpen`, which only the gallery passes) so the tiles are
 * reviewable without a click, and once closed as a player first meets it.
 */
export default function RoundSummaryPreviewPage() {
	const canonical = ROUND_SUMMARY_CASES[0]

	return (
		<div className="space-y-10">
			<div className="space-y-2 text-sm text-muted-foreground">
				<p>
					The card that sits under the progress grid once a classic round's picks are locked. Every
					fixture below is hand-written rows run through the real <code>buildRoundSummary</code>, so
					the counts, the ordering and which tiles appear at all are the builder's answers rather
					than the fixture's. No auth, no database.
				</p>
				<p>
					The card is <strong>collapsed</strong> on the game page; the gallery opens it with a{' '}
					<code>defaultOpen</code> the page never passes. The closed state is the first section
					below.
				</p>
			</div>

			<section className="space-y-3">
				<header>
					<h2 className="font-display text-lg font-semibold">Collapsed — how a player meets it</h2>
					<p className="text-sm text-muted-foreground">
						The trigger carries the most-backed line, the one headline that exists even with no
						prices at all.
					</p>
				</header>
				<RoundSummaryCard summary={canonical.summary} />
			</section>

			{ROUND_SUMMARY_CASES.map((c) => (
				<section key={c.key} className="space-y-3 border-t border-border pt-6">
					<header>
						<h2 className="font-display text-lg font-semibold">{c.title}</h2>
						<p className="text-sm text-muted-foreground">{c.description}</p>
					</header>
					<RoundSummaryCard summary={c.summary} defaultOpen />
					<div className="w-[360px] max-w-full rounded-lg border border-dashed border-border/70 p-1">
						<div className="text-2xs uppercase tracking-wide text-muted-foreground/70 mb-1 px-1">
							360px
						</div>
						<RoundSummaryCard summary={c.summary} defaultOpen />
					</div>
					<div>
						<div className="text-2xs uppercase tracking-wide text-muted-foreground/70 mb-1">
							Share text
						</div>
						<pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-sans">
							{formatRoundSummaryText(c.summary)}
						</pre>
					</div>
				</section>
			))}
		</div>
	)
}
