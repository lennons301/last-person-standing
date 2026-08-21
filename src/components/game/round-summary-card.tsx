'use client'

import { Disclosure } from '@/components/ui/disclosure'
import {
	ROUND_SUMMARY_COPY as COPY,
	formatTeamFigure,
	formatWinChance,
	type RoundSummaryHeadToHead,
	type RoundSummaryPlayerRef,
	type RoundSummaryTeamFigure,
	type RoundSummaryView,
} from '@/lib/game/round-summary-view'

/**
 * The post-deadline round summary, on the game page.
 *
 * A thin renderer over `buildRoundSummary`: every count, every ordering and
 * every inclusion decision arrived already made, and every fixed word comes out
 * of `ROUND_SUMMARY_COPY`. Nothing here classifies a pick or sorts a list — the
 * summary and its copy table are the seams, and a rule added here would be a
 * rule with no test.
 *
 * It sits directly under the progress grid (the component that reveals the picks
 * it narrates) and it is **collapsed on load**, with the most-backed line in its
 * trigger: that one line is the whole headline, and it's the only figure that
 * exists even on a competition with no prices at all.
 *
 * `defaultOpen` exists for the `/preview` gallery, which has no way to click.
 * The page never passes it.
 */
export function RoundSummaryCard({
	summary,
	defaultOpen = false,
}: {
	summary: RoundSummaryView
	defaultOpen?: boolean
}) {
	return (
		<Disclosure
			title={summary.headline}
			subtitle={`${summary.round.longLabel} · ${COPY.cardSubtitle}`}
			defaultOpen={defaultOpen}
			className="mt-4"
		>
			<div className="divide-y divide-border">
				{summary.market && (
					<Tile heading={COPY.tiles.market}>
						<p className="text-sm">
							{summary.market.picks} {summary.market.picks === 1 ? 'pick' : 'picks'} across{' '}
							{summary.market.distinctTeams} {summary.market.distinctTeams === 1 ? 'team' : 'teams'}{' '}
							· average{' '}
							<span className="tabular-nums">
								{formatWinChance(summary.market.averageWinProbability)}
							</span>{' '}
							· <span className="tabular-nums">{summary.market.expectedSurvivors.toFixed(1)}</span>{' '}
							{COPY.expectedSurvivors}
						</p>
						{summary.market.pricedPicks != null && (
							<p className="text-xs text-muted-foreground mt-1">
								Over the {summary.market.pricedPicks} picks we hold a price for.
							</p>
						)}
					</Tile>
				)}

				<Tile heading={COPY.tiles.mostBacked}>
					<ul className="space-y-1.5">
						{summary.mostBacked.map((team) => (
							<li key={team.teamId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
								<span className="text-sm font-semibold tabular-nums">
									{team.count} of {summary.playersAlive}
								</span>
								<span className="text-sm">{formatTeamFigure(team)}</span>
								<PlayerNames players={team.players} />
							</li>
						))}
					</ul>
					{summary.noPickPlayers.length > 0 && (
						<p className="mt-2 text-xs text-muted-foreground">
							<span className="font-semibold">{COPY.noPickHeading}:</span>{' '}
							{summary.noPickPlayers.map((p) => p.name).join(', ')}
						</p>
					)}
				</Tile>

				{summary.boldest && (
					<Tile heading={COPY.tiles.boldest}>
						{summary.boldest.kind === 'calls' ? (
							<ul className="space-y-1.5">
								{summary.boldest.calls.map((call) => (
									<li
										key={`${call.player.name}:${call.teamId}`}
										className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
									>
										<span className="text-sm font-semibold">{playerLabel(call.player)}</span>
										<span className="text-sm">{formatTeamFigure(call)}</span>
										<span className="text-xs text-muted-foreground">
											{call.side === 'home' ? 'at home to' : 'away at'} {call.opponentShortName}
										</span>
									</li>
								))}
							</ul>
						) : (
							<>
								<p className="text-sm">{COPY.noUnderdogs}</p>
								{summary.boldest.shortest && summary.boldest.longest && (
									<p className="mt-1 text-xs text-muted-foreground">
										{COPY.pricesInPlay}: {formatTeamFigure(summary.boldest.shortest)} —{' '}
										{formatTeamFigure(summary.boldest.longest)}
									</p>
								)}
							</>
						)}
					</Tile>
				)}

				{summary.lonePicks.length > 0 && (
					<Tile heading={COPY.tiles.lonePicks}>
						<ul className="space-y-1.5">
							{summary.lonePicks.map((lone) => (
								<li key={lone.teamId} className="flex flex-wrap items-baseline gap-x-2">
									<span className="text-sm font-semibold">{playerLabel(lone.player)}</span>
									<span className="text-sm">{formatTeamFigure(lone)}</span>
								</li>
							))}
						</ul>
					</Tile>
				)}

				{summary.headToHead.length > 0 && (
					<Tile heading={COPY.tiles.headToHead}>
						<ul className="space-y-3">
							{summary.headToHead.map((clash) => (
								<li key={clash.fixtureId} className="space-y-1">
									<div className="text-sm font-semibold">
										{clash.home.shortName} v {clash.away.shortName}
									</div>
									<Side side={clash.home} />
									<Side side={clash.away} />
									<p className="text-xs text-muted-foreground">{stakes(clash)}</p>
								</li>
							))}
						</ul>
					</Tile>
				)}

				{summary.leftOnTable && (
					<Tile heading={COPY.tiles.leftOnTable}>
						<p className="text-sm">{formatTeamFigure(summary.leftOnTable)}</p>
					</Tile>
				)}

				{!summary.oddsAvailable && (
					<p className="px-4 py-3 text-xs text-muted-foreground">{COPY.noOdds}</p>
				)}
			</div>
		</Disclosure>
	)
}

function Tile({ heading, children }: { heading: string; children: React.ReactNode }) {
	return (
		<section className="px-4 py-3">
			<h3 className="text-2xs uppercase tracking-wide text-muted-foreground mb-1.5">{heading}</h3>
			{children}
		</section>
	)
}

function Side({ side }: { side: RoundSummaryTeamFigure & { players: RoundSummaryPlayerRef[] } }) {
	return (
		<div className="flex flex-wrap items-baseline gap-x-2">
			<span className="text-sm">{formatTeamFigure(side)}</span>
			<PlayerNames players={side.players} />
		</div>
	)
}

function PlayerNames({ players }: { players: RoundSummaryPlayerRef[] }) {
	return (
		<span className="text-xs text-muted-foreground">
			{players.map((p) => playerLabel(p)).join(', ')}
		</span>
	)
}

/** `(auto)` wherever a player is named — the pick was made for them. */
function playerLabel(player: RoundSummaryPlayerRef): string {
	return player.isAuto ? `${player.name} (auto)` : player.name
}

function stakes(clash: RoundSummaryHeadToHead): string {
	return clash.drawTakesAll ? COPY.drawTakesAll : COPY.drawStartingRound
}
