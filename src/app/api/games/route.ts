import { and, asc, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { generateInviteCode } from '@/lib/game/invite-code'
import { openRoundForGame } from '@/lib/game/round-lifecycle'
import { competition, round } from '@/lib/schema/competition'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

export async function GET() {
	const session = await requireSession()

	const myGames = await db.query.gamePlayer.findMany({
		where: eq(gamePlayer.userId, session.user.id),
		with: {
			game: {
				with: {
					competition: true,
					players: true,
				},
			},
		},
	})

	const games = myGames.map((gp) => ({
		id: gp.game.id,
		name: gp.game.name,
		gameMode: gp.game.gameMode,
		status: gp.game.status,
		competition: gp.game.competition.name,
		playerCount: gp.game.players.length,
		aliveCount: gp.game.players.filter((p) => p.status === 'alive').length,
		myStatus: gp.status,
		entryFee: gp.game.entryFee,
		isAdmin: gp.game.createdBy === session.user.id,
	}))

	return NextResponse.json(games)
}

export async function POST(request: Request) {
	const session = await requireSession()
	const body = await request.json()

	const { name, competitionId, gameMode, modeConfig, entryFee, maxPlayers } = body

	if (!name || !competitionId || !gameMode) {
		return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
	}

	// Verify competition exists
	const comp = await db.query.competition.findFirst({
		where: eq(competition.id, competitionId),
	})

	if (!comp) {
		return NextResponse.json({ error: 'Competition not found' }, { status: 404 })
	}

	// Cup mode requires FIFA pot tier differences, which only exist for
	// group_knockout competitions. On league competitions there's no source
	// of truth for tiers — cup-tier.ts silently returns 0, breaking the
	// lives/upset mechanic. Reject at the API boundary so the UI gate can't
	// be bypassed.
	if (gameMode === 'cup' && comp.type !== 'group_knockout') {
		return NextResponse.json(
			{
				error: 'cup-mode-requires-group-knockout',
				message: 'Cup mode is only available for tournaments with tier-based seeding.',
			},
			{ status: 400 },
		)
	}

	const inviteCode = generateInviteCode()

	// Link to the competition's earliest still-pickable round. A round is
	// pickable iff its deadline is in the future — once the deadline has
	// passed, attaching a new game to it would be dead-on-arrival because
	// validateClassicPick / validateTurboPicks / validateCupPicks all reject
	// post-deadline submissions. Skip those rounds and roll to the next.
	//
	// Rounds without a deadline (e.g. WC knockouts pre-draw with TBD fixtures)
	// are still pickable in principle — we keep them as candidates.
	const candidates = await db.query.round.findMany({
		where: and(
			eq(round.competitionId, competitionId),
			inArray(round.status, ['open', 'active', 'upcoming']),
		),
		orderBy: [asc(round.number)],
	})
	const now = new Date()
	const firstRound = candidates.find((r) => !r.deadline || r.deadline > now)
	if (!firstRound) {
		return NextResponse.json(
			{
				error: 'no-pickable-round',
				message:
					'This competition has no upcoming rounds. The deadline for every remaining gameweek has passed.',
			},
			{ status: 400 },
		)
	}

	const [newGame] = await db
		.insert(game)
		.values({
			name,
			createdBy: session.user.id,
			competitionId,
			gameMode,
			modeConfig: modeConfig ?? {},
			entryFee: entryFee ?? null,
			maxPlayers: maxPlayers ?? null,
			inviteCode,
			status: 'active',
			currentRoundId: firstRound.id,
		})
		.returning()

	// Creator automatically joins the game. Cup mode needs livesRemaining
	// seeded from modeConfig.startingLives — the schema default of 0 leaves
	// players with no lives and breaks the cup upset/save mechanic.
	// Defaults match the form: cup → 3, other modes → 0 (field ignored).
	const configLives = (modeConfig as { startingLives?: number } | null)?.startingLives
	const creatorStartingLives = configLives ?? (gameMode === 'cup' ? 3 : 0)
	await db.insert(gamePlayer).values({
		gameId: newGame.id,
		userId: session.user.id,
		livesRemaining: creatorStartingLives,
	})

	// Create payment record if entry fee is set
	if (entryFee) {
		await db.insert(payment).values({
			gameId: newGame.id,
			userId: session.user.id,
			amount: entryFee,
		})
	}

	// Round status follows game lifecycle: starting a game on this round
	// flips it from 'upcoming' to 'open' if it isn't already.
	await openRoundForGame(firstRound.id)

	return NextResponse.json(newGame, { status: 201 })
}
