import {
	buildHeroFixtures,
	type HeroFixture,
	STAT_LINE_FIXTURES,
} from '@/app/preview/game-hero/fixtures'
import { AutoPickNotice } from '@/components/game/auto-pick-banner'
import { GameHero } from '@/components/game/game-hero'
import { GameStatLine } from '@/components/game/game-stat-line'
import { RebuyActions } from '@/components/game/rebuy-actions'
import { UnpaidNotice } from '@/components/game/settle-up-notice'
import { VoidedPickNotice } from '@/components/game/voided-pick-banner'
import { voidedPickMessage } from '@/components/game/voided-pick-message'
import { IdentityBarDemo } from './identity-bar-demo'

// Fixtures are relative to render time, so never cache this page.
export const dynamic = 'force-dynamic'

export default function GameHeroPreviewPage() {
	const fixtures = buildHeroFixtures(new Date())

	return (
		<div className="space-y-8">
			<p className="text-sm text-muted-foreground">
				The game page's top-of-page chrome — identity bar, stat line and every <code>GameHero</code>{' '}
				variant — rendered from hand-built descriptors, the same shape <code>buildGameView</code>{' '}
				returns: the pre-deadline pick states, then the post-deadline live / round-result / winner /
				rebuy / spectator states across all three modes.
			</p>

			<section className="space-y-2">
				<header>
					<h2 className="font-display text-sm font-semibold">Identity bar + stat line</h2>
					<p className="text-xs text-muted-foreground">
						The page's top two elements, in page order. The share action is inert here.
					</p>
				</header>
				<div className="rounded-lg border border-border bg-card p-4">
					<IdentityBarDemo
						name="Thursday Night Survivors"
						mode="classic"
						competition="Premier League 2026/27"
						entryFee="10.00"
					/>
					<GameStatLine stats={STAT_LINE_FIXTURES[1].stats} />
				</div>
			</section>

			{['turbo', 'cup'].map((mode) => (
				<section key={mode} className="space-y-2">
					<header>
						<h2 className="font-display text-sm font-semibold capitalize">
							Identity bar · {mode} mode
						</h2>
					</header>
					<div className="rounded-lg border border-border bg-card p-4">
						<IdentityBarDemo
							name={mode === 'turbo' ? 'Office Turbo GW7' : 'World Cup Cup Game'}
							mode={mode}
							competition={mode === 'turbo' ? 'Premier League 2026/27' : 'World Cup 2026'}
							entryFee={mode === 'turbo' ? '5.00' : null}
						/>
						<GameStatLine stats={STAT_LINE_FIXTURES[0].stats} />
					</div>
				</section>
			))}

			{STAT_LINE_FIXTURES.map((f) => (
				<section key={f.id} className="space-y-2">
					<header>
						<h2 className="font-display text-sm font-semibold">{f.title}</h2>
						{f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
					</header>
					<div className="rounded-lg border border-border bg-card p-4">
						<GameStatLine
							stats={f.stats}
							unpaidNotice={
								f.unpaid ? <UnpaidNotice amount={f.unpaid.amount} status={f.unpaid.status} /> : null
							}
						/>
					</div>
				</section>
			))}

			{fixtures.map((f) => (
				<section key={f.id} className="space-y-2">
					<header>
						<h2 className="font-display text-sm font-semibold">{f.title}</h2>
						{f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
					</header>
					<GameHero hero={f.hero} notices={noticeFor(f)} rebuyAction={rebuyActionFor(f)} />
				</section>
			))}
		</div>
	)
}

function noticeFor(fixture: HeroFixture): React.ReactNode {
	if (!fixture.notice) return null
	// The presentational halves of the real banners — the stateful wrappers need
	// localStorage / a live payload, neither of which exists in the gallery.
	const notice =
		fixture.notice === 'auto-pick' ? (
			<AutoPickNotice teamShortName="BUR" kickoffLabel="Sat 15:00" />
		) : (
			<VoidedPickNotice message={voidedPickMessage(fixture.hero.mode)} />
		)
	return <div className="mt-4">{notice}</div>
}

function rebuyActionFor(fixture: HeroFixture): React.ReactNode {
	if (fixture.hero.kind !== 'rebuy') return null
	// The real buttons, pointed at a game that doesn't exist — the gallery is
	// database-free, so clicking one just toasts a failure.
	return (
		<RebuyActions
			gameId="preview"
			entryFee={fixture.hero.entryFee}
			pendingPayment={fixture.hero.pendingPayment}
			size="lg"
		/>
	)
}
