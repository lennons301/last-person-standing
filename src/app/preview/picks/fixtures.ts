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
		title: 'Season start — no form, no position',
		note: 'A brand-new competition with no table yet. The bar stays as the way into the form sheet.',
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
		home: MUN(['W', 'L', 'D', 'W', 'W'], 4),
		away: BHA(['D', 'W', 'W', 'L', 'D'], 8),
		kickoffInMinutes: -35,
		disabledSide: 'both',
		disabledReason: 'Kicked off',
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
	return { id: t.id, short: t.shortName, name: t.name, colour: null, badgeUrl: null }
}

export const PLANNER_FIXTURES: PlannerFixtureSet[] = [
	{
		id: 'planner-with-chips',
		title: 'Planner round — locked pick + used/planned chips',
		note: 'Every truncation trap at once: the narrowest container, three- and four-letter codes, and an AUTO / USED / PLANNED chip under each name.',
		roundNumber: 27,
		roundName: 'Gameweek 27',
		roundLabel: 'GW27',
		deadlineInMinutes: 60 * 24 * 6,
		fixturesTbc: false,
		fixtures: [
			{
				id: 'pf-1',
				homeTeam: plannerTeam(MUN()),
				awayTeam: plannerTeam(NEW()),
				kickoffInMinutes: 60 * 24 * 6 + 90,
			},
			{
				id: 'pf-2',
				homeTeam: plannerTeam(WOL()),
				awayTeam: plannerTeam(BHA()),
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
