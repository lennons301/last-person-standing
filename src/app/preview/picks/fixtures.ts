import type { CupPickSlot } from '@/components/picks/cup-pick'
import type {
	FixtureTeamInfo,
	SideOdds,
	SideState,
	TeamStandingLine,
} from '@/components/picks/fixture-row'
import type { PlannerFixture, UsedInfo } from '@/components/picks/planner-round'
import type { RankedPick } from '@/components/picks/ranked-item'
import type { FormMarket } from '@/components/picks/team-form-panel'
import type { TurboPickEntry } from '@/components/picks/turbo-pick'
import { type UsedRoundLabel, usedRoundLabel } from '@/lib/game/pick-table-view'
import type { FormSplit, TeamFormDetail } from '@/lib/game/team-form-detail'

/**
 * Hand-built fixtures for the pick-selector gallery.
 *
 * Deliberately not derived from the pick view builders: the gallery exists to
 * review the *rendering* of the shared `FixtureRow` across every state each mode
 * can put it in — including combinations a live database rarely produces on
 * demand (a season-start round with no form anywhere, both teams already used,
 * a cup tier gap on the underdog).
 *
 * Grouped the way the gallery is: the **shared-row** fixtures first, then one
 * section per mode (classic, turbo, cup).
 *
 * The turbo and cup sections go a level up from the row: they drive the real
 * `TurboPick` / `CupPick`, because the states worth reviewing there (partial
 * ranking, unsaved changes) belong to the picker rather than to any one row.
 */

function team(
	id: string,
	name: string,
	shortName: string,
	form?: FixtureTeamInfo['form'],
	leaguePosition?: number,
): FixtureTeamInfo {
	return { id, name, shortName, form, leaguePosition: leaguePosition ?? null }
}

/**
 * A used team's round, in the two forms the chip needs — built the way
 * `getClassicPickData` builds them, from the league's own labels, so the gallery
 * shows the short chip and the long announcement a real round produces.
 */
function usedIn(roundNumber: number): UsedRoundLabel {
	return usedRoundLabel('league', roundNumber)
}

/**
 * A believable league row per club, so the Table view's columns sort into an
 * order that reads like a real table. Hand-built like everything else here: the
 * point is reviewing the board, not the standings sync.
 */
const STANDING: Record<string, TeamStandingLine> = {
	ARS: { played: 26, points: 60, goalsFor: 58, goalsAgainst: 20 },
	LIV: { played: 26, points: 55, goalsFor: 54, goalsAgainst: 26 },
	MUN: { played: 26, points: 48, goalsFor: 44, goalsAgainst: 32 },
	BHA: { played: 26, points: 45, goalsFor: 41, goalsAgainst: 34 },
	CHE: { played: 25, points: 42, goalsFor: 40, goalsAgainst: 33 },
	NEW: { played: 26, points: 38, goalsFor: 36, goalsAgainst: 35 },
	TOT: { played: 26, points: 35, goalsFor: 38, goalsAgainst: 40 },
	NFO: { played: 26, points: 30, goalsFor: 27, goalsAgainst: 38 },
	WOL: { played: 26, points: 22, goalsFor: 21, goalsAgainst: 49 },
}

/** The same team with its league row attached — the Table view's own input. */
function withStanding(t: FixtureTeamInfo): FixtureTeamInfo {
	return { ...t, standing: STANDING[t.shortName] ?? null }
}

const MUN = (form?: FixtureTeamInfo['form'], pos?: number) =>
	team('t-mun', 'Manchester United', 'MUN', form, pos)
const NEW = (form?: FixtureTeamInfo['form'], pos?: number) =>
	team('t-new', 'Newcastle United', 'NEW', form, pos)
const WOL = (form?: FixtureTeamInfo['form'], pos?: number) =>
	team('t-wol', 'Wolverhampton Wanderers', 'WOL', form, pos)
const BHA = (form?: FixtureTeamInfo['form'], pos?: number) =>
	team('t-bha', 'Brighton & Hove Albion', 'BHA', form, pos)
const ARS = (form?: FixtureTeamInfo['form'], pos?: number) =>
	team('t-ars', 'Arsenal', 'ARS', form, pos)
const LIV = (form?: FixtureTeamInfo['form'], pos?: number) =>
	team('t-liv', 'Liverpool', 'LIV', form, pos)
const CHE = (form?: FixtureTeamInfo['form'], pos?: number) =>
	team('t-che', 'Chelsea', 'CHE', form, pos)
const NFO = (form?: FixtureTeamInfo['form'], pos?: number) =>
	team('t-nfo', 'Nottingham Forest', 'NFO', form, pos)

export interface RowFixture {
	id: string
	title: string
	note?: string
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	/** Minutes from render time — kept relative so the local-time rendering is exercised. */
	kickoffInMinutes?: number | null
	selectedSide?: 'home' | 'away' | null
	usedSide?: 'home' | 'away' | 'both' | null
	usedLabel?: string
	homeState?: SideState
	awayState?: SideState
	tierValue?: number
	tierMax?: 3 | 5
	plusN?: number
	showHeart?: boolean
	underdogSide?: 'home' | 'away' | null
	/**
	 * Indicative win-probabilities, with the "odds as of" stamp kept relative to
	 * render time like every other clock in this gallery. Omitted entirely for
	 * the fixtures we have no odds for — which is the state worth reviewing next
	 * to a priced row.
	 */
	odds?: { home: SideOdds; draw: SideOdds; away: SideOdds; asOfInMinutes: number }
	/** Disables the pick handlers, for read-only / post-deadline states. */
	readonly?: boolean
}

export const ROW_FIXTURES: RowFixture[] = [
	{
		id: 'row-default',
		title: 'Default — form + league position',
		note: 'The everyday row: pick button as the primary affordance, metadata one step down.',
		home: MUN(['W', 'W', 'D', 'L', 'W'], 4),
		away: NEW(['L', 'D', 'W', 'W', 'L'], 9),
		kickoffInMinutes: 60 * 26,
	},
	{
		id: 'row-empty-form',
		title: 'Season start — position, no form',
		note: 'Nobody has played yet — the pre-season row. Position must still render (it used to disappear with the form bar), and it now stands alone: no "No form yet" filler beside it, because a position with nothing next to it already reads as a season that has not started.',
		home: WOL(undefined, 14),
		away: BHA(undefined, 7),
		kickoffInMinutes: 60 * 50,
	},
	{
		id: 'row-no-form-no-position',
		title: 'No form, no position',
		note: 'What cup mode passes (it sources neither). The bottom bar stands down entirely — there is nothing for it to hold, and nothing worth tapping through to.',
		home: WOL(),
		away: BHA(),
		kickoffInMinutes: 60 * 72,
	},
	{
		id: 'row-selected',
		title: 'Selected (pending confirmation)',
		home: MUN(['W', 'W', 'W', 'D', 'W'], 2),
		away: BHA(['L', 'L', 'D', 'W', 'L'], 15),
		kickoffInMinutes: 60 * 30,
		selectedSide: 'home',
	},
	{
		id: 'row-current-pick',
		title: 'Locked-in pick (CURRENT chip)',
		home: NEW(['W', 'D', 'W', 'W', 'W'], 3),
		away: WOL(['L', 'L', 'L', 'D', 'L'], 18),
		kickoffInMinutes: 60 * 8,
		selectedSide: 'home',
		homeState: { kind: 'current' },
		readonly: true,
	},
	{
		id: 'row-one-used',
		title: 'One side already used',
		note: 'Classic: the away team was burned in an earlier gameweek.',
		home: MUN(['D', 'W', 'L', 'W', 'D'], 6),
		away: NEW(['W', 'W', 'D', 'L', 'W'], 5),
		kickoffInMinutes: 60 * 34,
		usedSide: 'away',
		awayState: { kind: 'used', label: 'Used GW3' },
	},
	{
		id: 'row-both-used',
		title: 'Both sides used',
		note: 'The label sits on the top strip, outside the dimmed card — inline it competed with the team names for width on a phone.',
		home: MUN(['D', 'W', 'L', 'W', 'D'], 6),
		away: NEW(['W', 'W', 'D', 'L', 'W'], 5),
		kickoffInMinutes: 60 * 34,
		usedSide: 'both',
		usedLabel: 'Both used',
	},
	{
		id: 'row-restricted',
		title: 'Restricted side',
		note: 'A side the mode rules put out of reach, with the reason on the chip.',
		home: WOL(['W', 'D', 'D', 'W', 'L'], 11),
		away: BHA(['W', 'W', 'W', 'W', 'D'], 1),
		kickoffInMinutes: 60 * 12,
		homeState: { kind: 'restricted', reason: 'Top 6 only' },
	},
	{
		id: 'row-cup-tier-gap',
		title: 'Cup — tier gap on the underdog',
		note: 'Heart + tier pips on the strip say "this fixture pays lives"; the +N chip sits on the team that earns them.',
		home: BHA(['W', 'W', 'D', 'W', 'W'], 2),
		away: WOL(['L', 'D', 'L', 'L', 'W'], 17),
		kickoffInMinutes: 60 * 44,
		tierValue: 3,
		tierMax: 3,
		plusN: 2,
		showHeart: true,
		underdogSide: 'away',
	},
	{
		id: 'row-odds',
		title: 'Win probability — odds present',
		note: 'De-vigged from a bookmaker 1X2 market: the percentage each side wins, with the raw decimal price it came from. Identical for every player, frozen once the deadline passes, and stamped with when the market was last read.',
		home: MUN(['W', 'W', 'D', 'L', 'W'], 4),
		away: NEW(['L', 'D', 'W', 'W', 'L'], 9),
		kickoffInMinutes: 60 * 26,
		// A 1.50 / 4.00 / 6.00 market: 8/13, 3/13 and 2/13 once the overround is out.
		odds: {
			home: { probability: 8 / 13, price: 1.5 },
			draw: { probability: 3 / 13, price: 4 },
			away: { probability: 2 / 13, price: 6 },
			asOfInMinutes: -95,
		},
	},
	{
		id: 'row-odds-absent',
		title: 'Win probability — odds absent',
		note: 'The same fixture, unpriced (a competition we have no odds for, or a match nobody is quoting). No percentage, no placeholder, no zero — and no "odds as of" stamp either. The row is exactly the row it was before odds existed.',
		home: MUN(['W', 'W', 'D', 'L', 'W'], 4),
		away: NEW(['L', 'D', 'W', 'W', 'L'], 9),
		kickoffInMinutes: 60 * 26,
	},
	{
		id: 'row-odds-longshot',
		title: 'Win probability — heavy favourite',
		note: 'A lopsided market, at the widest split the chips have to hold: three digits of percentage against a long price, on a phone.',
		home: ARS(['W', 'W', 'W', 'W', 'D'], 1),
		away: WOL(['L', 'L', 'D', 'L', 'L'], 20),
		kickoffInMinutes: 60 * 30,
		odds: {
			home: { probability: 0.879, price: 1.1 },
			draw: { probability: 0.084, price: 11 },
			away: { probability: 0.037, price: 24 },
			asOfInMinutes: -12,
		},
	},
]

/**
 * Planner-context fixtures. The nested planner is the tightest place `FixtureRow`
 * renders (card inside a card inside the page), and the one where short codes
 * used to truncate — so the gallery renders the real `PlannerRound`, chips and
 * all, rather than approximating its width.
 */
export interface PlannerFixtureSet {
	id: string
	title: string
	note?: string
	roundNumber: number
	roundName: string
	roundLabel: string
	deadlineInMinutes: number | null
	fixturesTbc: boolean
	fixtures: Array<Omit<PlannerFixture, 'kickoff'> & { kickoffInMinutes: number | null }>
	usedTeams: UsedInfo[]
	lockedTeamId: string | null
}

function plannerTeam(t: FixtureTeamInfo): PlannerFixture['homeTeam'] {
	return {
		id: t.id,
		short: t.shortName,
		name: t.name,
		colour: null,
		badgeUrl: null,
		// Form and position reach the planner too, so a future pick is decided with
		// the same information the current round offers. A planner row's form is
		// *current* form — its opponents haven't played yet.
		form: t.form,
		leaguePosition: t.leaguePosition ?? null,
	}
}

export const PLANNER_FIXTURES: PlannerFixtureSet[] = [
	{
		id: 'planner-with-chips',
		title: 'Planner round — locked pick + used/planned chips',
		note: 'Every truncation trap at once: the narrowest container, three- and four-letter codes, and an AUTO / USED / PLANNED chip under each name. Form dots, position and the tap-through are classic parity: the planner used to pass none of them.',
		roundNumber: 27,
		roundName: 'Gameweek 27',
		roundLabel: 'GW27',
		deadlineInMinutes: 60 * 24 * 6,
		fixturesTbc: false,
		fixtures: [
			{
				id: 'pf-1',
				homeTeam: plannerTeam(MUN(['W', 'W', 'D', 'L', 'W'], 4)),
				awayTeam: plannerTeam(NEW(['L', 'D', 'W', 'W', 'L'], 9)),
				kickoffInMinutes: 60 * 24 * 6 + 90,
			},
			{
				id: 'pf-2',
				homeTeam: plannerTeam(WOL(['L', 'L', 'D', 'W', 'L'], 17)),
				awayTeam: plannerTeam(BHA(['W', 'D', 'W', 'W', 'D'], 6)),
				kickoffInMinutes: 60 * 24 * 6 + 180,
			},
		],
		usedTeams: [
			{ teamId: 't-new', label: 'Used GW3', kind: 'used' },
			{ teamId: 't-bha', label: 'Planned GW29', kind: 'planned-elsewhere' },
		],
		lockedTeamId: 't-mun',
	},
	{
		id: 'planner-season-start',
		title: 'Planner round — season start, no form anywhere',
		note: 'The empty-form case in the planner: nobody has played, so both halves say so and the positions carry the row. Still taps through — the sheet has a season record to show even when the dots have nothing.',
		roundNumber: 2,
		roundName: 'Gameweek 2',
		roundLabel: 'GW2',
		deadlineInMinutes: 60 * 24 * 8,
		fixturesTbc: false,
		fixtures: [
			{
				id: 'pf-empty-1',
				homeTeam: plannerTeam(WOL(undefined, 14)),
				awayTeam: plannerTeam(BHA(undefined, 7)),
				kickoffInMinutes: 60 * 24 * 8 + 120,
			},
		],
		usedTeams: [],
		lockedTeamId: null,
	},
	{
		id: 'planner-tbc',
		title: 'Planner round — fixtures TBC',
		roundNumber: 31,
		roundName: 'Gameweek 31',
		roundLabel: 'GW31',
		deadlineInMinutes: null,
		fixturesTbc: true,
		fixtures: [],
		usedTeams: [],
		lockedTeamId: null,
	},
]

/* ------------------------------------------------------------------ classic */

const TOT = (form?: FixtureTeamInfo['form'], pos?: number) =>
	team('t-tot', 'Tottenham Hotspur', 'TOT', form, pos)

/**
 * The six `SideState` variants, in the wording classic puts on each. Rendered as
 * a matrix rather than folded into the shared rows above: the shared section
 * reviews how the row renders, this one reviews what classic *says* — and two of
 * these states have no other review surface in the app today.
 */
export const CLASSIC_SIDE_STATES: RowFixture[] = [
	{
		id: 'classic-state-current',
		title: 'current — your pick for this round',
		home: MUN(['W', 'W', 'D', 'L', 'W'], 4),
		away: NEW(['L', 'D', 'W', 'W', 'L'], 9),
		kickoffInMinutes: 60 * 20,
		selectedSide: 'home',
		homeState: { kind: 'current' },
		readonly: true,
	},
	{
		id: 'classic-state-tentative',
		title: 'tentative — a pencilled-in plan',
		note: 'No classic surface emits this today: the planner commits real picks (auto-locked below), so a dashed "maybe" has nowhere to come from yet. Carried so the state has somewhere to be reviewed if planned picks come back.',
		home: CHE(['W', 'D', 'W', 'L', 'D'], 8),
		away: TOT(['L', 'W', 'W', 'D', 'L'], 10),
		kickoffInMinutes: 60 * 24 * 7,
		homeState: { kind: 'tentative' },
		readonly: true,
	},
	{
		id: 'classic-state-auto-locked',
		title: 'auto-locked — the planner’s committed pick',
		note: 'What a locked upcoming pick looks like in the planner: a real pick against that round, editable until its own deadline.',
		home: MUN(['W', 'W', 'D', 'L', 'W'], 4),
		away: NEW(['L', 'D', 'W', 'W', 'L'], 9),
		kickoffInMinutes: 60 * 24 * 6,
		homeState: { kind: 'auto-locked' },
		readonly: true,
	},
	{
		id: 'classic-state-restricted',
		title: 'restricted — out of reach by rule',
		note: 'Classic itself restricts nothing; the World Cup variant’s stage rules are what this is for. The reason travels on the chip so the row never dims without saying why.',
		home: WOL(['W', 'D', 'D', 'W', 'L'], 11),
		away: BHA(['W', 'W', 'W', 'W', 'D'], 1),
		kickoffInMinutes: 60 * 24 * 9,
		homeState: { kind: 'restricted', reason: 'Group stage only' },
		readonly: true,
	},
	{
		id: 'classic-state-used',
		title: 'used — burned in an earlier gameweek',
		home: MUN(['D', 'W', 'L', 'W', 'D'], 6),
		away: NEW(['W', 'W', 'D', 'L', 'W'], 5),
		kickoffInMinutes: 60 * 30,
		usedSide: 'away',
		awayState: { kind: 'used', label: 'Used GW3' },
	},
	{
		id: 'classic-state-planned-elsewhere',
		title: 'planned-elsewhere — spent on another round',
		note: 'The cascade the planner applies: a team locked into GW29 is locked out of every other round, this one included.',
		home: CHE(['W', 'W', 'W', 'D', 'L'], 3),
		away: BHA(['L', 'D', 'L', 'W', 'D'], 13),
		kickoffInMinutes: 60 * 24 * 6,
		awayState: { kind: 'planned-elsewhere', label: 'Picked GW29' },
	},
	{
		id: 'classic-state-both-used',
		title: 'both used — the whole fixture is spent',
		note: 'The one row classic can produce that has nothing left to offer. The label sits on the top strip, outside the dimmed card, so the reason survives the dimming (#135).',
		home: MUN(['D', 'W', 'L', 'W', 'D'], 6),
		away: NEW(['W', 'W', 'D', 'L', 'W'], 5),
		kickoffInMinutes: 60 * 32,
		usedSide: 'both',
		usedLabel: 'Both used',
	},
	{
		id: 'classic-state-empty-form',
		title: 'empty form — GW1, nothing played',
		note: 'Season start, inside the card: positions still render and each form half carries its position alone — the filler that used to sit beside it said only what the empty half already says.',
		home: WOL(undefined, 14),
		away: BHA(undefined, 7),
		kickoffInMinutes: 60 * 26,
	},
]

/**
 * The classic picker *card* — `ClassicPick` itself, not just its rows. These are
 * the states the card as a whole moves through, and the reason they're worth a
 * gallery: everything the game hero above already says (round name, deadline,
 * the locked-in pick) has to be absent here, and that's only reviewable by
 * looking at the whole card.
 */
export interface ClassicCardFixture {
	id: string
	title: string
	note?: string
	roundName: string
	roundNumber: number
	deadlineInMinutes: number | null
	fixtures: Array<{
		id: string
		home: FixtureTeamInfo
		away: FixtureTeamInfo
		kickoffInMinutes: number | null
	}>
	/** teamId → the round it was spent in, as `getClassicPickData` builds it. */
	usedTeamsByRound: Record<string, UsedRoundLabel>
	existingPickTeamId: string | null
	existingPickFixtureId: string | null
	currentRoundClosed?: boolean
	summaryInHero?: boolean
	startExpanded?: boolean
	/**
	 * Which view the card opens on — a league opens on the Table, anything else
	 * on the fixtures. Undefined behaves like a knockout.
	 */
	competitionType?: 'league' | 'knockout' | 'group_knockout'
	/** Which planner set (by id) hangs off this card, if any. */
	plannerSetId?: string
}

// Standings attached to every card fixture: with a league table behind the
// round, the card carries the Fixtures ⇄ Table toggle, which is itself one of
// the states worth reviewing here.
const CLASSIC_CARD_FIXTURES: ClassicCardFixture['fixtures'] = [
	{
		id: 'cf-1',
		home: withStanding(MUN(['W', 'W', 'D', 'L', 'W'], 4)),
		away: withStanding(NEW(['L', 'D', 'W', 'W', 'L'], 9)),
		kickoffInMinutes: 60 * 26,
	},
	{
		id: 'cf-2',
		home: withStanding(CHE(['W', 'D', 'W', 'L', 'D'], 8)),
		away: withStanding(TOT(['L', 'W', 'W', 'D', 'L'], 10)),
		kickoffInMinutes: 60 * 28,
	},
	{
		id: 'cf-3',
		home: withStanding(WOL(['L', 'L', 'D', 'W', 'L'], 17)),
		away: withStanding(BHA(['W', 'D', 'W', 'W', 'D'], 6)),
		kickoffInMinutes: 60 * 31,
	},
]

export const CLASSIC_CARDS: ClassicCardFixture[] = [
	{
		id: 'classic-card-no-pick',
		title: 'No pick yet — the expanded picker',
		note: 'Opens straight onto the fixtures. No round heading and no deadline chip: the hero directly above names the round and counts the deadline down, and this card’s only job is "choose your team".',
		roundName: 'Gameweek 27',
		roundNumber: 27,
		deadlineInMinutes: 60 * 22,
		fixtures: CLASSIC_CARD_FIXTURES,
		usedTeamsByRound: { 't-tot': usedIn(12) },
		existingPickTeamId: null,
		existingPickFixtureId: null,
	},
	{
		id: 'classic-card-selected',
		title: 'Selected — confirm bar live',
		note: 'A pick locked in and the fixtures re-opened, so the selection carries its ring and the sticky confirm bar reads "Already locked". Tap a different team to see the pending flavour ("Lock in pick").',
		roundName: 'Gameweek 27',
		roundNumber: 27,
		deadlineInMinutes: 60 * 22,
		fixtures: CLASSIC_CARD_FIXTURES,
		usedTeamsByRound: { 't-tot': usedIn(12) },
		existingPickTeamId: 't-mun',
		existingPickFixtureId: 'cf-1',
		startExpanded: true,
	},
	{
		id: 'classic-card-locked-collapsed',
		title: 'Locked — collapsed under the hero',
		note: 'The state the app actually ships: with the hero carrying the pick (`summaryInHero`), the whole card shrinks to the way back in.',
		roundName: 'Gameweek 27',
		roundNumber: 27,
		deadlineInMinutes: 60 * 22,
		fixtures: CLASSIC_CARD_FIXTURES,
		usedTeamsByRound: { 't-tot': usedIn(12) },
		existingPickTeamId: 't-mun',
		existingPickFixtureId: 'cf-1',
		summaryInHero: true,
	},
	{
		id: 'classic-card-locked-standalone',
		title: 'Locked — collapsed with no hero summary',
		note: 'The fallback branch, for any state where the hero isn’t carrying the pick: the card repeats team, opponent, side and deadline itself.',
		roundName: 'Gameweek 27',
		roundNumber: 27,
		deadlineInMinutes: 60 * 22,
		fixtures: CLASSIC_CARD_FIXTURES,
		usedTeamsByRound: { 't-tot': usedIn(12) },
		existingPickTeamId: 't-mun',
		existingPickFixtureId: 'cf-1',
	},
	{
		id: 'classic-card-league-table-view',
		title: 'League — opens on the Table view',
		note: 'The same card on a league competition: the toggle sits above the picker and the board is what the player lands on. Switch to Fixtures and back — the toggle is the only chrome the expanded card carries besides the way out.',
		roundName: 'Gameweek 27',
		roundNumber: 27,
		deadlineInMinutes: 60 * 22,
		fixtures: CLASSIC_CARD_FIXTURES,
		usedTeamsByRound: { 't-tot': usedIn(12) },
		existingPickTeamId: null,
		existingPickFixtureId: null,
		competitionType: 'league',
	},
	{
		id: 'classic-card-closed-round',
		title: 'Round closed — read-only, planner open',
		note: 'Past the deadline the current round is read-only, and the planner becomes the section — opened by default, and nested one level deeper than anywhere else the row renders. With `summaryInHero` the top card stands down entirely and only the planner remains.',
		roundName: 'Gameweek 27',
		roundNumber: 27,
		deadlineInMinutes: -45,
		fixtures: CLASSIC_CARD_FIXTURES,
		usedTeamsByRound: { 't-tot': usedIn(12) },
		existingPickTeamId: 't-mun',
		existingPickFixtureId: 'cf-1',
		currentRoundClosed: true,
		plannerSetId: 'planner-with-chips',
	},
]

/* --------------------------------------------------- classic: the Table view */

export interface PickTableScenarioFixture {
	id: string
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	kickoffInMinutes: number | null
	/** Kept relative to render time like every other clock in this gallery. */
	odds?: { home: SideOdds; draw: SideOdds; away: SideOdds; asOfInMinutes: number }
}

export interface PickTableScenario {
	id: string
	title: string
	note?: string
	fixtures: PickTableScenarioFixture[]
	/** teamId → the round it was spent in, as classic's pick data builds it. */
	usedTeamsByRound?: Record<string, UsedRoundLabel>
	/** teamId → why it can't be picked, for restrictions that aren't "used". */
	restrictedTeams?: Record<string, string>
	currentTeamId?: string | null
	readonly?: boolean
}

const PRICED_FIXTURES: PickTableScenarioFixture[] = [
	{
		id: 'pt-1',
		home: withStanding(ARS(['W', 'W', 'D', 'W', 'W'], 1)),
		away: withStanding(WOL(['L', 'L', 'D', 'L', 'L'], 18)),
		kickoffInMinutes: 60 * 26,
		odds: {
			home: { probability: 0.82, price: 1.18 },
			draw: { probability: 0.11, price: 9 },
			away: { probability: 0.07, price: 13.5 },
			asOfInMinutes: -180,
		},
	},
	{
		id: 'pt-2',
		home: withStanding(MUN(['W', 'W', 'D', 'L', 'W'], 4)),
		away: withStanding(NEW(['L', 'D', 'W', 'W', 'L'], 9)),
		kickoffInMinutes: 60 * 28,
		odds: {
			home: { probability: 0.51, price: 1.85 },
			draw: { probability: 0.25, price: 4 },
			away: { probability: 0.24, price: 3.9 },
			asOfInMinutes: -180,
		},
	},
	{
		id: 'pt-3',
		home: withStanding(CHE(['W', 'D', 'W', 'L', 'D'], 6)),
		away: withStanding(LIV(['W', 'W', 'L', 'W', 'D'], 2)),
		kickoffInMinutes: 60 * 31,
		odds: {
			home: { probability: 0.33, price: 2.9 },
			draw: { probability: 0.25, price: 4 },
			away: { probability: 0.42, price: 2.25 },
			asOfInMinutes: -180,
		},
	},
]

/** The same three fixtures with every price stripped: the unpriced board. */
const UNPRICED_FIXTURES: PickTableScenarioFixture[] = PRICED_FIXTURES.map(
	({ odds: _odds, ...f }) => f,
)

/**
 * The same board with one team's form removed — a promoted club with nothing
 * recorded yet, sitting beside teams that have played. That club is also the
 * longest name in the set (Wolverhampton Wanderers), and the scenario below
 * spends it, so one row carries the three things that used to fight for width:
 * the longest name, a used chip under it and an empty form cell.
 */
const ONE_TEAM_NO_FORM: PickTableScenarioFixture[] = PRICED_FIXTURES.map((f, i) =>
	i === 0 ? { ...f, away: { ...f.away, form: undefined } } : f,
)

export const PICK_TABLE_SCENARIOS: PickTableScenario[] = [
	{
		id: 'table-priced',
		title: 'Priced — the default board',
		note: 'Opens in league order: position ascending. Two headers re-ask the question — Win for the market read, Team for A–Z — and tapping the sorted one flips it. Form and Next are labels: three results carry no order, and the opponent’s name answers nothing.',
		fixtures: PRICED_FIXTURES,
	},
	{
		id: 'table-narrow',
		title: 'Phone width — a used chip, a long name and no form, on one row',
		note: 'The state the five columns exist for, and the one to measure at 375px and 360px: no horizontal scroll and no pinned column, with the widest things a row carries stacked on a single row — the longest club name in the league, a used-team chip under it and a team that hasn’t kicked off yet. None of them sets a column’s width: the board’s proportions are declared, so the team column takes a name and a chip and no more, the name gives up its tail rather than the columns beside it giving up space, and what that frees goes to form and the win chance. The win column keeps its decimal price at both widths — it stacks under the percentage rather than being dropped.',
		fixtures: ONE_TEAM_NO_FORM,
		usedTeamsByRound: { 't-wol': usedIn(2), 't-new': usedIn(11) },
	},
	{
		id: 'table-unpriced',
		title: 'No odds for the round',
		note: 'The market read, missing. Each row says "No odds" rather than showing a 0%, the rest of the row is unaffected, and sorting by Win degrades to the tie-break (team name) instead of inventing an order — the board itself still opens in league order, which needs no prices.',
		fixtures: UNPRICED_FIXTURES,
	},
	{
		id: 'table-mixed-odds',
		title: 'Some fixtures priced, some not',
		note: 'The state the sort rules exist for: the unpriced rows sink to the bottom whichever way the win column is pointed — ascending must not float "we don’t know" above a 7% shot.',
		fixtures: [PRICED_FIXTURES[0], ...UNPRICED_FIXTURES.slice(1)],
	},
	{
		id: 'table-empty-form',
		title: 'Pre-season — nothing played, every row still taps through',
		note: 'Opening positions, nothing played and no form anywhere. Every form cell says so explicitly rather than rendering blank — and every one of them still opens the sheet, which carries the position, the season record, the next fixture’s odds and the link on to the form guide, none of which need a played match. Gate the tap on having results and this board is the one with no way through to any of it.',
		fixtures: PRICED_FIXTURES.map((f) => ({
			...f,
			odds: undefined,
			home: { ...f.home, form: undefined, standing: { played: 0 } },
			away: { ...f.away, form: undefined, standing: { played: 0 } },
		})),
	},
	{
		id: 'table-used-restricted',
		title: 'Used and restricted teams',
		note: 'Classic’s spent teams carry the round they went in, and anything else the mode blocks carries its reason. Both stay in the table — "Arsenal, used in GW3" is the answer to the question the player is asking — and neither can be selected. Nor can the round’s current pick: it is marked, not re-offered.',
		fixtures: PRICED_FIXTURES,
		usedTeamsByRound: { 't-ars': usedIn(3), 't-new': usedIn(11) },
		restrictedTeams: { 't-liv': 'Blocked' },
		currentTeamId: 't-che',
	},
]

/* ---------------------------------------------------------------------- cup */

const SHW = () => team('t-shw', 'Sheffield Wednesday', 'SHW')
const ACC = () => team('t-acc', 'Accrington Stanley', 'ACC')

/**
 * Cup rows carry no form and no league position — deliberately, and not a gap
 * this gallery papers over: a cup team's meaningful form lives in its *league*,
 * not the cup, so sourcing it is a cross-competition problem deferred to the
 * FA-Cup effort. What's reviewable here is everything cup gets from the
 * shared row for free: the type scale, the unclipped short code, the truncating
 * full name, and the tier annotations landing on the right side of the fixture.
 */
export interface CupCardFixtureRow {
	id: string
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	kickoffInMinutes: number | null
	/** From home perspective: positive = home is the higher tier. */
	tierDifference: number
}

export interface CupCardFixture {
	id: string
	title: string
	note?: string
	/** 6 for the World Cup, up to 10 for a domestic cup. */
	numberOfPicks: number
	livesRemaining: number
	maxLives: number
	fixtures: CupCardFixtureRow[]
	initialSlots: CupPickSlot[]
	readonly?: boolean
}

const CUP_CARD_FIXTURES: CupCardFixtureRow[] = [
	{
		id: 'cupf-1',
		home: MUN(),
		away: ACC(),
		kickoffInMinutes: 60 * 26,
		// Three tiers between them: unpickable from the favourite's side, and the
		// biggest life bonus on the board from the underdog's.
		tierDifference: 3,
	},
	{
		id: 'cupf-2',
		home: SHW(),
		away: BHA(),
		kickoffInMinutes: 60 * 28,
		// Away is two tiers up: the away side is restricted, and picking the home
		// underdog earns +2.
		tierDifference: -2,
	},
	{
		id: 'cupf-3',
		home: WOL(),
		away: NEW(),
		kickoffInMinutes: 60 * 30,
		// One tier apart: pickable both ways, +1 on the underdog, no heart.
		tierDifference: 1,
	},
	{
		id: 'cupf-4',
		home: CHE(),
		away: TOT(),
		kickoffInMinutes: 60 * 31,
		// Same tier: pickable both ways with nothing to earn. The strip still
		// renders — `CupPick` passes `tierValue={0}`, not `undefined` — so it
		// carries three empty pips, no heart, no +N, and the kickoff on its
		// right. The plainest strip cup can produce, not the absence of one.
		tierDifference: 0,
	},
]

/**
 * The cup picker card. Same reason classic's cards are here: what matters is
 * what *isn't* rendered — the round name, the deadline countdown and "rank N
 * picks" all belong to the game hero directly above, so the card no longer
 * repeats them (#157).
 */
export const CUP_CARDS: CupCardFixture[] = [
	{
		id: 'cup-card-open',
		title: 'Nothing ranked yet',
		note: 'Opens onto the fixtures with every slot empty. No deadline strip and no "rank 6 picks" line: the hero above carries both, and the ranked column is the only place the count now appears.',
		numberOfPicks: 6,
		livesRemaining: 2,
		maxLives: 3,
		fixtures: CUP_CARD_FIXTURES,
		initialSlots: [],
	},
	{
		id: 'cup-card-part-ranked',
		title: 'Part-ranked — two underdogs and a level-tier pick',
		note: 'The lives summary projects the gain, and the ranked column shows the two shapes a slot takes: an underdog pick that pays lives and a level-tier pick that does not. Tap a fourth team to keep filling it.',
		numberOfPicks: 6,
		livesRemaining: 2,
		maxLives: 3,
		fixtures: CUP_CARD_FIXTURES,
		initialSlots: [
			{ confidenceRank: 1, fixtureId: 'cupf-1', pickedSide: 'away' },
			{ confidenceRank: 2, fixtureId: 'cupf-4', pickedSide: 'home' },
			{ confidenceRank: 3, fixtureId: 'cupf-2', pickedSide: 'home' },
		],
	},
	{
		id: 'cup-card-readonly',
		title: 'Read-only — the completed game',
		note: 'What a finished game leaves behind: submit is disabled and every pick, reorder and remove click is swallowed. Worth noticing that the rows still look tappable — `readonly` ignores the clicks rather than disabling the buttons, which is CupPick’s own handling; the shared row only dims what it is told to.',
		numberOfPicks: 6,
		livesRemaining: 1,
		maxLives: 3,
		fixtures: CUP_CARD_FIXTURES,
		initialSlots: [
			{ confidenceRank: 1, fixtureId: 'cupf-3', pickedSide: 'away' },
			{ confidenceRank: 2, fixtureId: 'cupf-1', pickedSide: 'away' },
		],
		readonly: true,
	},
]

/**
 * Turbo-mode fixtures: the whole picker, not just a row.
 *
 * Turbo's API only accepts a complete ranking, so two of the picker's states —
 * a partial ranking, and an on-screen order that has drifted from the submitted
 * one — never come back from a database. `initialRanking` is what lets the
 * gallery mount them (see `TurboPick`).
 */
export interface TurboScenario {
	id: string
	title: string
	note?: string
	numberOfPicks: number
	fixtures: Array<{
		id: string
		home: FixtureTeamInfo
		away: FixtureTeamInfo
		kickoffInMinutes: number | null
	}>
	/** What the player has locked in. Empty, or exactly `numberOfPicks` entries. */
	existingPicks: TurboPickEntry[]
	/** What the list starts on, when that differs from the submission. */
	initialRanking?: TurboPickEntry[]
	/**
	 * Which view the remaining fixtures open on. A league opens on the Table —
	 * the ranking board — and anything else on the fixture rows; the toggle is
	 * offered either way, because these rounds all carry standings.
	 */
	competitionType?: 'league' | 'knockout' | 'group_knockout'
}

/** Teams carry their league row: the picker's Table view is made of those columns. */
function turboFixture(
	id: string,
	home: FixtureTeamInfo,
	away: FixtureTeamInfo,
	kickoffInMinutes: number,
): TurboScenario['fixtures'][number] {
	return { id, home: withStanding(home), away: withStanding(away), kickoffInMinutes }
}

/** Five fixtures with form and positions everywhere — the everyday turbo round. */
const TURBO_ROUND: TurboScenario['fixtures'] = [
	turboFixture(
		'tf-1',
		MUN(['W', 'W', 'D', 'L', 'W'], 4),
		NEW(['L', 'D', 'W', 'W', 'L'], 9),
		60 * 26,
	),
	turboFixture(
		'tf-2',
		ARS(['W', 'W', 'W', 'D', 'W'], 1),
		WOL(['L', 'L', 'D', 'L', 'W'], 17),
		60 * 27,
	),
	turboFixture(
		'tf-3',
		BHA(['D', 'W', 'L', 'W', 'D'], 7),
		LIV(['W', 'D', 'W', 'W', 'W'], 2),
		60 * 29,
	),
	turboFixture(
		'tf-4',
		CHE(['L', 'W', 'W', 'D', 'L'], 8),
		NFO(['D', 'L', 'W', 'L', 'D'], 13),
		60 * 32,
	),
	turboFixture(
		'tf-5',
		NEW(['L', 'D', 'W', 'W', 'L'], 9),
		MUN(['W', 'W', 'D', 'L', 'W'], 4),
		60 * 50,
	),
]

/** Season start: positions from last season's table, nobody has kicked a ball. */
const TURBO_ROUND_NO_FORM: TurboScenario['fixtures'] = [
	turboFixture('tfe-1', WOL(undefined, 14), BHA(undefined, 7), 60 * 50),
	turboFixture('tfe-2', NFO(undefined, 13), ARS(undefined, 1), 60 * 52),
	turboFixture('tfe-3', CHE(undefined, 8), LIV(undefined, 2), 60 * 54),
	// Nothing played yet, so the league row is an empty one rather than last
	// season's — the state the Table view's dashes exist for.
].map((f) => ({
	...f,
	home: { ...f.home, standing: { played: 0 } },
	away: { ...f.away, standing: { played: 0 } },
}))

const THREE_SUBMITTED: TurboPickEntry[] = [
	{ fixtureId: 'tf-2', confidenceRank: 1, predictedResult: 'home_win' },
	{ fixtureId: 'tf-3', confidenceRank: 2, predictedResult: 'away_win' },
	{ fixtureId: 'tf-1', confidenceRank: 3, predictedResult: 'draw' },
]

export const TURBO_SCENARIOS: TurboScenario[] = [
	{
		id: 'turbo-empty',
		title: 'Turbo — nothing ranked yet',
		note: 'The opening state: an empty confidence list over every fixture in the round. No round title and no deadline chip — both belong to the game hero above the picker.',
		numberOfPicks: 3,
		fixtures: TURBO_ROUND,
		existingPicks: [],
	},
	{
		id: 'turbo-partial',
		title: 'Turbo — partially ranked (nothing submitted)',
		note: 'Mid-flow: one of three ranked, the rest still in the remaining list. Nothing is locked in, so there is no submission notice and the confirm bar stays disabled.',
		numberOfPicks: 3,
		fixtures: TURBO_ROUND,
		existingPicks: [],
		initialRanking: [{ fixtureId: 'tf-2', confidenceRank: 1, predictedResult: 'home_win' }],
	},
	{
		id: 'turbo-full',
		title: 'Turbo — fully ranked and submitted',
		note: 'Three of three locked in and unchanged since: "Picks locked in", and the confirm bar has nothing to resubmit.',
		numberOfPicks: 3,
		fixtures: TURBO_ROUND,
		existingPicks: THREE_SUBMITTED,
	},
	{
		id: 'turbo-dirty',
		title: 'Turbo — unsaved changes',
		note: 'Submitted, then reordered: the top two have swapped places on screen but not in the database. The notice flips to "Unsaved changes" and the bar re-arms.',
		numberOfPicks: 3,
		fixtures: TURBO_ROUND,
		existingPicks: THREE_SUBMITTED,
		initialRanking: [
			{ fixtureId: 'tf-3', confidenceRank: 1, predictedResult: 'away_win' },
			{ fixtureId: 'tf-2', confidenceRank: 2, predictedResult: 'home_win' },
			{ fixtureId: 'tf-1', confidenceRank: 3, predictedResult: 'draw' },
		],
	},
	{
		id: 'turbo-empty-form',
		title: 'Turbo — season start, no form anywhere',
		note: 'Gameweek 1. Every remaining row keeps its league position and shows it alone — no form, and no filler where the form would be — and the ranked row still taps through, to a form sheet that reports an unplayed season rather than an empty one.',
		numberOfPicks: 2,
		fixtures: TURBO_ROUND_NO_FORM,
		existingPicks: [],
		initialRanking: [{ fixtureId: 'tfe-2', confidenceRank: 1, predictedResult: 'away_win' }],
	},
	{
		id: 'turbo-table-view',
		title: 'Turbo — the picker opened on the Table view',
		note: 'A league round, so the picker opens on the board instead of the fixture rows: rank a team straight off the standings, and the confidence list above stays the ranking — it owns the drag-reorder, the prediction change, and the draw, which a board of teams cannot express. Toggle back to the fixtures and the same two calls are there.',
		numberOfPicks: 3,
		competitionType: 'league',
		fixtures: TURBO_ROUND,
		existingPicks: [],
		initialRanking: [
			{ fixtureId: 'tf-2', confidenceRank: 1, predictedResult: 'home_win' },
			{ fixtureId: 'tf-1', confidenceRank: 2, predictedResult: 'draw' },
		],
	},
]

/* ------------------------------------------- turbo: ranking from the Table */

/**
 * The ranking board on its own, at both widths.
 *
 * The picker scenarios above cover it in context (at full width, where the
 * confirm bar behaves); this is the board itself, which is the half that has to
 * survive a phone — classic's five columns plus a sixth carrying either a rank
 * chip or three controls, with no horizontal scroll to hide it in.
 */
export interface TurboTableScenario {
	id: string
	title: string
	note?: string
	/** How many the round asks for — what the add button counts towards. */
	numberOfPicks: number
	fixtures: PickTableScenarioFixture[]
	/**
	 * The confidence set, most confident first. `teamId` is the team backed to
	 * win; null is a draw, which only the Fixtures view can call.
	 */
	ranking: Array<{ fixtureId: string; teamId: string | null }>
	readonly?: boolean
}

export const TURBO_TABLE_SCENARIOS: TurboTableScenario[] = [
	{
		id: 'turbo-table-empty',
		title: 'Nothing ranked yet',
		note: 'The same board classic picks from, with a sixth column asking a different question: every row offers "Rank #1", and the same three headers still sort it.',
		numberOfPicks: 3,
		fixtures: PRICED_FIXTURES,
		ranking: [],
	},
	{
		id: 'turbo-table-part-ranked',
		title: 'Part-ranked — a team call and a draw',
		note: 'Two of three called. Arsenal carries "Ranked #1" and the controls that order it; Wolves, its opponent, is marked "#1: ARS" and offers nothing — one prediction per fixture. The draw on Chelsea v Liverpool marks both of that fixture’s rows, because no team wins it: it can be changed or removed from the confidence list above the board, never from a row.',
		numberOfPicks: 3,
		fixtures: PRICED_FIXTURES,
		ranking: [
			{ fixtureId: 'pt-1', teamId: 't-ars' },
			{ fixtureId: 'pt-3', teamId: null },
		],
	},
	{
		id: 'turbo-table-full',
		title: 'Ranked to the round’s count',
		note: 'Three of three. The board still offers a fourth — the Fixtures view does too, and the confirm bar is what holds the line by arming only on exactly the round’s count — so what to look at here is the ends of the ranking: #1 cannot move up and #3 cannot move down.',
		numberOfPicks: 3,
		fixtures: PRICED_FIXTURES,
		ranking: [
			{ fixtureId: 'pt-1', teamId: 't-ars' },
			{ fixtureId: 'pt-2', teamId: 't-mun' },
			{ fixtureId: 'pt-3', teamId: 't-liv' },
		],
	},
	{
		id: 'turbo-table-unpriced',
		title: 'No odds for the round',
		note: 'The market read, missing, with a ranking already on it. Each row says "No odds" rather than a 0%, the ranking is untouched, and sorting by Win degrades to the tie-break — ranking from a board is not a market feature.',
		numberOfPicks: 3,
		fixtures: UNPRICED_FIXTURES,
		ranking: [{ fixtureId: 'pt-2', teamId: 't-new' }],
	},
	{
		id: 'turbo-table-readonly',
		title: 'Read-only — past the deadline',
		note: 'The board still reads and still sorts; nothing adds, moves or removes.',
		numberOfPicks: 3,
		fixtures: PRICED_FIXTURES,
		ranking: [
			{ fixtureId: 'pt-1', teamId: 't-ars' },
			{ fixtureId: 'pt-2', teamId: 't-mun' },
		],
		readonly: true,
	},
]

/**
 * Ranked rows in isolation, at both widths. The picker scenarios above cover
 * them in context; this is the row itself — the tap-through target, the rank
 * chip and the reorder controls all competing for the same line on a phone.
 */
export interface RankedListFixture {
	id: string
	title: string
	note?: string
	picks: RankedPick[]
}

export const RANKED_LIST_FIXTURES: RankedListFixture[] = [
	{
		id: 'ranked-tap-through',
		title: 'Ranked item — form tap-through',
		note: 'Tap either team to open the same form sheet the remaining-fixtures list opens. Ranking a fixture used to drop its form entirely, so a committed pick could only be re-checked by un-ranking it — which is why the rows carry the whole team (the row draws none of it; the sheet behind it does).',
		picks: [
			{
				id: 'rl-1',
				rank: 1,
				fixtureId: 'tf-2',
				homeTeam: ARS(['W', 'W', 'W', 'D', 'W'], 1),
				awayTeam: WOL(['L', 'L', 'D', 'L', 'W'], 17),
				prediction: 'home_win',
			},
			{
				id: 'rl-2',
				rank: 2,
				fixtureId: 'tf-3',
				homeTeam: BHA(['D', 'W', 'L', 'W', 'D'], 7),
				awayTeam: LIV(['W', 'D', 'W', 'W', 'W'], 2),
				prediction: 'away_win',
			},
			{
				id: 'rl-3',
				rank: 3,
				fixtureId: 'tf-1',
				homeTeam: MUN(['W', 'W', 'D', 'L', 'W'], 4),
				awayTeam: NEW(['L', 'D', 'W', 'W', 'L'], 9),
				prediction: 'draw',
			},
			{
				id: 'rl-4',
				rank: 4,
				fixtureId: 'tf-4',
				homeTeam: CHE(['L', 'W', 'W', 'D', 'L'], 8),
				awayTeam: NFO(['D', 'L', 'W', 'L', 'D'], 13),
				prediction: 'home_win',
			},
		],
	},
]

/**
 * Form-sheet fixtures. `TeamFormPanel` is the presentational half split out of
 * `TeamFormSheet` — the sheet itself loads through a database-backed server
 * action, so the gallery drives the panel from these instead.
 */
export const TEAM_FORM_DETAIL: TeamFormDetail = {
	team: {
		id: 't-mun',
		name: 'Manchester United',
		shortName: 'MUN',
		badgeUrl: null,
		leaguePosition: 4,
	},
	// A team that's a fortress at home and ordinary away — the whole point of the
	// split. The aggregate row alone ("14-6-6") hides it completely.
	splits: {
		overall: {
			played: 26,
			wins: 14,
			draws: 6,
			losses: 6,
			goalsFor: 45,
			goalsAgainst: 30,
			form: ['W', 'D', 'L', 'W', 'W'],
		},
		home: {
			played: 13,
			wins: 10,
			draws: 2,
			losses: 1,
			goalsFor: 29,
			goalsAgainst: 11,
			form: ['W', 'W', 'D', 'W', 'W'],
		},
		away: {
			played: 13,
			wins: 4,
			draws: 4,
			losses: 5,
			goalsFor: 16,
			goalsAgainst: 19,
			form: ['D', 'L', 'W', 'L', 'D'],
		},
	},
	recent: [
		{
			roundNumber: 26,
			roundLabel: 'GW26',
			opponentShortName: 'NEW',
			opponentName: 'Newcastle United',
			opponentBadgeUrl: null,
			home: true,
			goalsFor: 3,
			goalsAgainst: 1,
			result: 'W',
		},
		{
			roundNumber: 25,
			roundLabel: 'GW25',
			opponentShortName: 'BHA',
			opponentName: 'Brighton & Hove Albion',
			opponentBadgeUrl: null,
			home: false,
			goalsFor: 1,
			goalsAgainst: 1,
			result: 'D',
		},
		{
			roundNumber: 24,
			roundLabel: 'GW24',
			opponentShortName: 'WOL',
			opponentName: 'Wolverhampton Wanderers',
			opponentBadgeUrl: null,
			home: false,
			goalsFor: 0,
			goalsAgainst: 2,
			result: 'L',
		},
	],
}

/** Nothing played, at any venue. Zeroes, not gaps. */
const EMPTY_SPLIT: FormSplit = {
	played: 0,
	wins: 0,
	draws: 0,
	losses: 0,
	goalsFor: 0,
	goalsAgainst: 0,
	form: [],
}

/** Season start: the team exists, nothing has been played, no table yet. */
export const TEAM_FORM_DETAIL_EMPTY: TeamFormDetail = {
	team: {
		id: 't-wol',
		name: 'Wolverhampton Wanderers',
		shortName: 'WOL',
		badgeUrl: null,
		leaguePosition: null,
	},
	splits: {
		overall: EMPTY_SPLIT,
		home: EMPTY_SPLIT,
		away: EMPTY_SPLIT,
	},
	recent: [],
}

/**
 * The full 1X2 the enriched sheet shows, matching `row-odds` above: the same
 * 1.50 / 4.00 / 6.00 market the fixture row quotes two-thirds of. `asOf` is
 * fixed rather than relative — the sheet's stamp is reviewed for wording and
 * width, not freshness.
 */
export const FORM_PANEL_MARKET: FormMarket = {
	home: { shortName: 'MUN', probability: 8 / 13, price: 1.5 },
	draw: { probability: 3 / 13, price: 4 },
	away: { shortName: 'NEW', probability: 2 / 13, price: 6 },
	asOf: '2026-02-21T11:30:00.000Z',
	teamSide: 'home',
}

/**
 * A lopsided market, at the widest the sheet's percentage + price columns get,
 * and seen from the *away* team's sheet — so the marked row is the away one.
 */
export const FORM_PANEL_MARKET_LONGSHOT: FormMarket = {
	home: { shortName: 'ARS', probability: 0.879, price: 1.1 },
	draw: { probability: 0.084, price: 11 },
	away: { shortName: 'WOL', probability: 0.037, price: 24 },
	asOf: '2026-02-21T11:30:00.000Z',
	teamSide: 'away',
}
