import type { CupPickSlot } from '@/components/picks/cup-pick'
import type { FixtureTeamInfo, SideOdds, SideState } from '@/components/picks/fixture-row'
import type { PlannerFixture, UsedInfo } from '@/components/picks/planner-round'
import type { RankedPick } from '@/components/picks/ranked-item'
import type { TurboPickEntry } from '@/components/picks/turbo-pick'
import type { TeamFormDetail } from '@/lib/game/team-form-detail'

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
	disabledSide?: 'home' | 'away' | 'both' | null
	disabledReason?: string
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
	odds?: { home: SideOdds; away: SideOdds; asOfInMinutes: number }
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
		note: 'Nobody has played yet. Position must still render (it used to disappear with the form bar), and the empty half says so rather than going blank.',
		home: WOL(undefined, 14),
		away: BHA(undefined, 7),
		kickoffInMinutes: 60 * 50,
	},
	{
		id: 'row-no-form-no-position',
		title: 'No form, no position',
		note: 'What cup mode passes (it sources neither). The bottom bar stands down entirely rather than claiming "no form yet" about teams the row knows nothing about.',
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
			away: { probability: 0.037, price: 24 },
			asOfInMinutes: -12,
		},
	},
	{
		id: 'row-kickoff-passed',
		title: 'Disabled — kickoff passed',
		note: 'Both sides dim and stop responding. `disabledReason` is accepted by the row but not rendered anywhere yet, and no mode passes it — a loose end for whichever mode ticket needs it.',
		home: MUN(['W', 'L', 'D', 'W', 'W'], 4),
		away: BHA(['D', 'W', 'W', 'L', 'D'], 8),
		kickoffInMinutes: -35,
		disabledSide: 'both',
		readonly: true,
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
		note: 'Season start reads as intentional rather than half-loaded: positions still render and each form half says "No form yet".',
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
	/** teamId → round label, as `getClassicPickData` builds it. */
	usedTeamsByRound: Record<string, string>
	existingPickTeamId: string | null
	existingPickFixtureId: string | null
	currentRoundClosed?: boolean
	summaryInHero?: boolean
	startExpanded?: boolean
	/** Which planner set (by id) hangs off this card, if any. */
	plannerSetId?: string
}

const CLASSIC_CARD_FIXTURES: ClassicCardFixture['fixtures'] = [
	{
		id: 'cf-1',
		home: MUN(['W', 'W', 'D', 'L', 'W'], 4),
		away: NEW(['L', 'D', 'W', 'W', 'L'], 9),
		kickoffInMinutes: 60 * 26,
	},
	{
		id: 'cf-2',
		home: CHE(['W', 'D', 'W', 'L', 'D'], 8),
		away: TOT(['L', 'W', 'W', 'D', 'L'], 10),
		kickoffInMinutes: 60 * 28,
	},
	{
		id: 'cf-3',
		home: WOL(['L', 'L', 'D', 'W', 'L'], 17),
		away: BHA(['W', 'D', 'W', 'W', 'D'], 6),
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
		usedTeamsByRound: { 't-tot': 'GW12' },
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
		usedTeamsByRound: { 't-tot': 'GW12' },
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
		usedTeamsByRound: { 't-tot': 'GW12' },
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
		usedTeamsByRound: { 't-tot': 'GW12' },
		existingPickTeamId: 't-mun',
		existingPickFixtureId: 'cf-1',
	},
	{
		id: 'classic-card-closed-round',
		title: 'Round closed — read-only, planner open',
		note: 'Past the deadline the current round is read-only, and the planner becomes the section — opened by default, and nested one level deeper than anywhere else the row renders. With `summaryInHero` the top card stands down entirely and only the planner remains.',
		roundName: 'Gameweek 27',
		roundNumber: 27,
		deadlineInMinutes: -45,
		fixtures: CLASSIC_CARD_FIXTURES,
		usedTeamsByRound: { 't-tot': 'GW12' },
		existingPickTeamId: 't-mun',
		existingPickFixtureId: 'cf-1',
		currentRoundClosed: true,
		plannerSetId: 'planner-with-chips',
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
}

function turboFixture(
	id: string,
	home: FixtureTeamInfo,
	away: FixtureTeamInfo,
	kickoffInMinutes: number,
): TurboScenario['fixtures'][number] {
	return { id, home, away, kickoffInMinutes }
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
]

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
		note: 'Gameweek 1. Every remaining row says "No form yet" and keeps its league position, and the ranked row still taps through — to a form sheet that reports an unplayed season rather than an empty one.',
		numberOfPicks: 2,
		fixtures: TURBO_ROUND_NO_FORM,
		existingPicks: [],
		initialRanking: [{ fixtureId: 'tfe-2', confidenceRank: 1, predictedResult: 'away_win' }],
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

function rankedTeam(t: FixtureTeamInfo): RankedPick['homeTeam'] {
	return { id: t.id, shortName: t.shortName, name: t.name, badgeUrl: t.badgeUrl ?? null }
}

export const RANKED_LIST_FIXTURES: RankedListFixture[] = [
	{
		id: 'ranked-tap-through',
		title: 'Ranked item — form tap-through',
		note: 'Tap either team to open the same form sheet the remaining-fixtures list opens. Ranking a fixture used to drop its form entirely, so a committed pick could only be re-checked by un-ranking it.',
		picks: [
			{
				id: 'rl-1',
				rank: 1,
				fixtureId: 'tf-2',
				homeTeam: rankedTeam(ARS()),
				awayTeam: rankedTeam(WOL()),
				prediction: 'home_win',
			},
			{
				id: 'rl-2',
				rank: 2,
				fixtureId: 'tf-3',
				homeTeam: rankedTeam(BHA()),
				awayTeam: rankedTeam(LIV()),
				prediction: 'away_win',
			},
			{
				id: 'rl-3',
				rank: 3,
				fixtureId: 'tf-1',
				homeTeam: rankedTeam(MUN()),
				awayTeam: rankedTeam(NEW()),
				prediction: 'draw',
			},
			{
				id: 'rl-4',
				rank: 4,
				fixtureId: 'tf-4',
				homeTeam: rankedTeam(CHE()),
				awayTeam: rankedTeam(NFO()),
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
	seasonRecord: { wins: 14, draws: 6, losses: 6 },
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
	headToHead: [
		{
			roundNumber: 26,
			roundLabel: 'GW26',
			homeTeamShortName: 'MUN',
			awayTeamShortName: 'NEW',
			homeScore: 3,
			awayScore: 1,
		},
	],
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
	seasonRecord: { wins: 0, draws: 0, losses: 0 },
	recent: [],
	headToHead: [],
}
