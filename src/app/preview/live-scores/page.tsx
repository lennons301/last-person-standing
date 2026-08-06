import { buildLiveScoresFixtures } from '@/app/preview/live-scores/fixtures'
import { PreviewLiveScores } from '@/app/preview/live-scores/preview-live-scores'
import { LiveScoresPanel } from '@/components/live/live-scores-panel'

// Fixtures are relative to render time, so never cache this page.
export const dynamic = 'force-dynamic'

export default function LiveScoresPreviewPage() {
	const now = new Date()
	const fixtures = buildLiveScoresFixtures(now)
	const busiest = fixtures[0]

	return (
		<div className="space-y-8">
			<p className="text-sm text-muted-foreground">
				The live scores pop-out. There is no permanent ticker band any more — a control appears
				whenever there is live action and opens the scoreboard as a bottom sheet. Each scenario
				below is a hand-built live payload; click the control to open the pop-out.
			</p>

			{fixtures.map((f) => (
				<section key={f.id} className="space-y-2">
					<header>
						<h2 className="font-display text-sm font-semibold">{f.title}</h2>
						{f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
					</header>
					<div className="rounded-lg border border-dashed border-border p-4">
						<PreviewLiveScores payload={f.payload} />
					</div>
				</section>
			))}

			<section className="space-y-2">
				<header>
					<h2 className="font-display text-sm font-semibold">Live window · reconnecting</h2>
					<p className="text-xs text-muted-foreground">
						Polling has dropped: the chip rides in the pop-out header instead of on the page.
					</p>
				</header>
				<div className="rounded-lg border border-dashed border-border p-4">
					<PreviewLiveScores payload={busiest.payload} reconnecting />
				</div>
			</section>

			<section className="space-y-2">
				<header>
					<h2 className="font-display text-sm font-semibold">Scoreboard · standalone</h2>
					<p className="text-xs text-muted-foreground">
						The pop-out's contents on their own — every fixture in the round, grouped live /
						upcoming / finished.
					</p>
				</header>
				<div className="rounded-lg border border-border bg-card p-4">
					<LiveScoresPanel fixtures={busiest.payload.fixtures} now={now} />
				</div>
			</section>
		</div>
	)
}
