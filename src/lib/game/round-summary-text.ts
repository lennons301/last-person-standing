/**
 * The round summary as pasteable prose.
 *
 * One pure function over the derived summary: same view in, byte-identical
 * string out. It classifies nothing — every count, order and inclusion decision
 * was already made by `buildRoundSummary` — it only chooses words.
 *
 * Two rules it keeps:
 *
 * 1. **Probabilities only.** Decimal prices belong on the card, where there's
 *    room for both; a chat message reads better with one number per team.
 * 2. **No inferred pronouns, ever.** A deterministic sentence builder guessing
 *    someone's gender is a bug with a real person's name attached to it. Players
 *    are named, or referred to as they/them.
 *
 * The headline is wrapped in asterisks because WhatsApp renders `*bold*`; every
 * other surface shows the asterisks harmlessly.
 */

import type {
	RoundSummaryBoldCall,
	RoundSummaryHeadToHead,
	RoundSummaryPlayerRef,
	RoundSummaryTeamFigure,
	RoundSummaryView,
} from '@/lib/game/round-summary-view'
import { formatWinChance } from '@/lib/game/round-summary-view'

/** How many gambles the prose names before it summarises the rest as a count. */
const BOLD_CALLS_NAMED = 3

export function formatRoundSummaryText(summary: RoundSummaryView): string {
	const paragraphs = [
		fieldParagraph(summary),
		gamblersParagraph(summary),
		clashesParagraph(summary),
	].filter((p): p is string => p != null && p.length > 0)
	return [headline(summary), '', paragraphs.join('\n\n')].join('\n')
}

function headline(summary: RoundSummaryView): string {
	const top = summary.mostBacked[0]
	const lead = top
		? `${top.count} of ${summary.playersAlive} on ${top.name}`
		: 'nobody got a pick in'
	return `*${summary.round.longLabel} — ${lead}*`
}

/** The field, and what the market made of it. */
function fieldParagraph(summary: RoundSummaryView): string {
	const sentences: string[] = []

	if (summary.picksMade === 0) {
		sentences.push(`Nobody in ${summary.round.longLabel} got a pick in.`)
	} else {
		const field =
			summary.picksMade === summary.playersAlive
				? `All ${summary.playersAlive} still standing got a pick in`
				: `${summary.picksMade} of ${summary.playersAlive} still standing got a pick in`
		const teams = summary.mostBacked.length
		sentences.push(`${field}, spread across ${teams} ${teams === 1 ? 'team' : 'teams'}.`)
	}

	const market = summary.market
	if (market) {
		const average = `${percent(market.averageWinProbability)} shot`
		const opener =
			market.pricedPicks == null
				? `The average pick was a ${average}`
				: `Across the ${market.pricedPicks} picks we hold a price for, the average was a ${average}`
		sentences.push(
			`${opener}, and the market expects ${market.expectedSurvivors.toFixed(1)} of them to survive.`,
		)
	}

	if (summary.noPickPlayers.length > 0) {
		sentences.push(`${nameList(summary.noPickPlayers)} made no pick at all.`)
	}

	return sentences.join(' ')
}

/** The gamblers, and the players standing on a team of their own. */
function gamblersParagraph(summary: RoundSummaryView): string {
	const sentences: string[] = []
	const boldest = summary.boldest

	if (boldest?.kind === 'calls') {
		const named = boldest.calls.slice(0, BOLD_CALLS_NAMED)
		const rest = boldest.calls.length - named.length
		const label = boldest.calls.length === 1 ? 'Boldest call' : 'Boldest calls'
		const tail = rest > 0 ? ` And ${rest} more went against the market.` : ''
		sentences.push(`${label}: ${named.map(boldCall).join('; ')}.${tail}`)
	} else if (boldest?.kind === 'none') {
		sentences.push(underdogless(boldest.shortest, boldest.longest))
	}

	if (summary.lonePicks.length > 0) {
		sentences.push(
			`Out on their own: ${summary.lonePicks
				.map((lone) => `${playerName(lone.player)} on ${teamWithChance(lone)}`)
				.join(', ')}.`,
		)
	}

	return sentences.join(' ')
}

function boldCall(call: RoundSummaryBoldCall): string {
	const venue = call.side === 'home' ? 'at home to' : 'away at'
	return `${playerName(call.player)} on ${teamWithChance(call)} ${venue} ${call.opponentName}`
}

function underdogless(
	shortest: RoundSummaryTeamFigure | null,
	longest: RoundSummaryTeamFigure | null,
): string {
	const opener = "Nobody backed an underdog — every pick was its match's favourite"
	if (!shortest || !longest) return `${opener}.`
	if (shortest.teamId === longest.teamId) {
		return `${opener}, ${shortest.name} at ${percent(shortest.winProbability)}.`
	}
	return `${opener}, from ${shortest.name} at ${percent(shortest.winProbability)} down to ${
		longest.name
	} at ${percent(longest.winProbability)}.`
}

/** The contested matches, and the best thing nobody took. */
function clashesParagraph(summary: RoundSummaryView): string {
	const sentences =
		summary.headToHead.length > 0
			? summary.headToHead.map(clash)
			: summary.picksMade > 0
				? ["Nobody was on the other side of anybody else's pick."]
				: []

	if (summary.leftOnTable) {
		sentences.push(
			`The shortest price nobody touched was ${summary.leftOnTable.name} at ${percent(
				summary.leftOnTable.winProbability,
			)}.`,
		)
	}

	return sentences.join(' ')
}

function clash(fixture: RoundSummaryHeadToHead): string {
	const stakes = fixture.drawTakesAll
		? ' — one side goes out, and a draw takes everyone in it'
		: ' — one side goes out'
	return `${fixture.home.name} v ${fixture.away.name} puts ${nameList(
		fixture.home.players,
	)} up against ${nameList(fixture.away.players)}${stakes}.`
}

/** "Alex", "Alex and Bea", "Alex, Bea and Cass" — never a pronoun. */
function nameList(players: RoundSummaryPlayerRef[]): string {
	const names = players.map(playerName)
	if (names.length <= 1) return names[0] ?? ''
	return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** A player, marked where the pick was made for them. */
function playerName(player: RoundSummaryPlayerRef): string {
	return player.isAuto ? `${player.name} (auto)` : player.name
}

/** A team, with its win chance where the round is priced. */
function teamWithChance(figure: RoundSummaryTeamFigure): string {
	if (figure.winProbability == null) return figure.name
	return `${figure.name} (${percent(figure.winProbability)})`
}

function percent(probability: number | null): string {
	return formatWinChance(probability) ?? ''
}
