import { buildHeroFixtures, type HeroFixture } from '@/app/preview/game-hero/fixtures'
import { AutoPickNotice } from '@/components/game/auto-pick-banner'
import { GameHero } from '@/components/game/game-hero'
import { GameStatLine } from '@/components/game/game-stat-line'
import { VoidedPickNotice, voidedPickMessage } from '@/components/game/voided-pick-banner'

// Fixtures are relative to render time, so never cache this page.
export const dynamic = 'force-dynamic'

export default function GameHeroPreviewPage() {
	const fixtures = buildHeroFixtures(new Date())

	return (
		<div className="space-y-8">
			<p className="text-sm text-muted-foreground">
				Every <code>GameHero</code> variant rendered from hand-built descriptors — the same shape{' '}
				<code>buildGameView</code> returns. Pre-deadline states only for now; later tickets add
				their variants here.
			</p>

			{fixtures.map((f) => (
				<section key={f.id} className="space-y-2">
					<header>
						<h2 className="font-display text-sm font-semibold">{f.title}</h2>
						{f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
					</header>
					<GameHero hero={f.hero} stats={f.stats} notices={noticeFor(f)} />
				</section>
			))}

			<section className="space-y-2">
				<header>
					<h2 className="font-display text-sm font-semibold">Stat line · standalone</h2>
					<p className="text-xs text-muted-foreground">
						The pot + players line the hero owns once <code>demote.headerStats</code> is set.
					</p>
				</header>
				<div className="rounded-lg border border-border bg-card p-4 space-y-3">
					<GameStatLine
						stats={{
							potConfirmed: '60.00',
							potTotal: '80.00',
							aliveCount: 5,
							playerCount: 8,
							rebuyAvailable: false,
						}}
					/>
					<GameStatLine
						stats={{
							potConfirmed: '120.00',
							potTotal: '120.00',
							aliveCount: 1,
							playerCount: 12,
							rebuyAvailable: true,
						}}
					/>
				</div>
			</section>
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
