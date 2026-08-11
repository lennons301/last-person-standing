import type { FixtureTeamInfo, SideState } from '@/components/picks/fixture-row'
import type { PlannerFixture, UsedInfo } from '@/components/picks/planner-round'
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
 * This file carries the **shared-row** fixtures only. The per-mode tickets
 * (classic / turbo / cup-lite) add their own alongside these.
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

const CHE = (form?: FixtureTeamInfo['form'], pos?: number) =>
	team('t-che', 'Chelsea', 'CHE', form, pos)
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
