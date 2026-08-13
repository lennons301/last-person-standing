import type { MoneySummary, SummaryGameMode } from '@/lib/game/me-summary-view'

/**
 * What the fold reveals: the headline profit or loss, and the games behind it.
 *
 * Pure presentation, and deliberately separate from the fold that hides it —
 * the client half owns whether this is on screen, this half owns nothing but
 * layout, so the gallery can render the opened state without a browser or a
 * database.
 */

/** A signed amount, since the sign is the whole point of the figure. */
function signed(amount: string): string {
	const value = Number.parseFloat(amount)
	if (value < 0) return `-£${Math.abs(value).toFixed(2)}`
	if (value > 0) return `+£${value.toFixed(2)}`
	return '£0.00'
}

/** An unsigned amount — a stake and a payout only ever go one way. */
function pounds(amount: string): string {
	return `£${Number.parseFloat(amount).toFixed(2)}`
}

const MODE_NAMES: Record<SummaryGameMode, string> = {
	classic: 'Classic',
	turbo: 'Turbo',
	cup: 'Cup',
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
	return (
		<div className="rounded-lg border border-border bg-card p-4">
			<div className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</div>
			<div className="font-display text-2xl font-semibold mt-1 tabular-nums">{value}</div>
			{note && <div className="text-xs text-muted-foreground mt-0.5">{note}</div>}
		</div>
	)
}

/**
 * Which way the player is, in words. Level is its own answer: a career of free
 * games, or one whose stakes all came back, is not a player who is down.
 */
function direction(net: string): string {
	const value = Number.parseFloat(net)
	if (value > 0) return 'Up over these games'
	if (value < 0) return 'Down over these games'
	return 'Level over these games'
}

export function MoneyPanel({ money }: { money: MoneySummary }) {
	return (
		<div className="space-y-3 p-4">
			<div className="grid grid-cols-3 gap-3">
				{/* Labelled differently from the columns below, which report the same
				    three figures one game at a time. */}
				<Figure label="Profit / loss" value={signed(money.net)} note={direction(money.net)} />
				<Figure label="Total staked" value={pounds(money.stake)} />
				<Figure label="Total won" value={pounds(money.winnings)} />
			</div>

			{money.games.length > 0 && (
				<table className="w-full text-sm">
					<caption className="sr-only">
						Profit and loss by game, biggest loss first. Stakes count what you have paid or marked
						paid, exactly as a game&apos;s pot counts it.
					</caption>
					<thead>
						<tr className="text-2xs uppercase tracking-wide text-muted-foreground">
							<th className="text-left font-normal py-1">Game</th>
							<th className="text-right font-normal py-1 px-2">Staked</th>
							<th className="text-right font-normal py-1 px-2">Won</th>
							<th className="text-right font-normal py-1">Net</th>
						</tr>
					</thead>
					<tbody>
						{money.games.map((row) => (
							<tr key={row.gameId} className="border-t border-border/60">
								<td className="py-1.5 pr-2">
									<div className="truncate font-medium leading-tight">{row.name}</div>
									<div className="text-2xs text-muted-foreground leading-tight mt-0.5 truncate">
										{MODE_NAMES[row.gameMode]} · {row.competitionName}
									</div>
								</td>
								<td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
									{pounds(row.stake)}
								</td>
								<td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
									{pounds(row.winnings)}
								</td>
								<td className="py-1.5 text-right tabular-nums font-medium">{signed(row.net)}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{/* Why the list can be shorter than the games played: a free game has no
			    money in it to report, and saying so beats leaving a gap. */}
			{money.freeGames > 0 && (
				<p className="text-xs text-muted-foreground">
					{money.freeGames} free {money.freeGames === 1 ? 'game' : 'games'} not listed — there was
					no money in {money.freeGames === 1 ? 'it' : 'them'}.
				</p>
			)}
		</div>
	)
}
