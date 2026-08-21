'use client'
import { groupBoardFixtures } from '@/lib/live/board'
import type { LiveFixture, LivePick } from '@/lib/live/types'
import { GoalCelebration } from './goal-celebration'
import { LiveFixtureCard } from './live-fixture-card'

interface LiveScoresPanelProps {
	fixtures: LiveFixture[]
	/** The viewer's own picks keyed by fixture id — badges the "My pick" card. */
	viewerPicksByFixture?: Map<string, LivePick>
	now?: Date
}

/**
 * The reference scoreboard: every fixture in the round, grouped live →
 * upcoming → finished. Purely presentational — the pop-out (`LiveScoresSheet`)
 * feeds it from the live payload, the preview gallery from hand-built fixtures.
 */
export function LiveScoresPanel({
	fixtures,
	viewerPicksByFixture,
	now = new Date(),
}: LiveScoresPanelProps) {
	const groups = groupBoardFixtures(fixtures, now)
	if (groups.length === 0) {
		return <p className="text-sm text-muted-foreground">No fixtures in this round yet.</p>
	}

	return (
		<div className="space-y-4">
			{groups.map((group) => (
				<section key={group.key} className="space-y-2">
					<h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
						{group.label}
					</h3>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{group.fixtures.map(({ fixture }) => {
							const viewerPick = viewerPicksByFixture?.get(fixture.id) ?? null
							return (
								<GoalCelebration key={fixture.id} fixtureId={fixture.id} viewerPick={viewerPick}>
									<LiveFixtureCard
										fixture={fixture}
										isMyPick={Boolean(viewerPick)}
										preMatchWinProbability={viewerPick?.preMatchWinProbability ?? null}
										now={now}
										className="w-full"
									/>
								</GoalCelebration>
							)
						})}
					</div>
				</section>
			))}
		</div>
	)
}
