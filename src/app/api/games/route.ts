import { and, asc, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { generateInviteCode } from '@/lib/game/invite-code'
import { openRoundForGame } from '@/lib/game/round-lifecycle'
import { competition, round, team } from '@/lib/schema/competition'
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

	// Cup mode is designed for cup competitions (knockout / group_knockout —
	// e.g. World Cup, FA Cup, League Cup). It's not appropriate for league
	// competitions like the PL where the format doesn't match. Reject at the
	// API boundary so the UI gate can't be bypassed.
	if (gameMode === 'cup' && comp.type === 'league') {
		return NextResponse.json(
			{
				error: 'cup-mode-not-on-league',
				message: 'Cup mode is for cup competitions only.',
			},
			{ status: 400 },
		)
	}

	// Group-knockout cup mode needs FIFA pot tags on every team — tier-diff
	// maths reads `external_ids.fifa_pot` and silently returns 0 when missing,
	// which would make underdog picks unrewarded. Refuse to create the game
	// until daily-sync has finished tagging the roster.
	if (gameMode === 'cup' && comp.type === 'group_knockout') {
		const compRounds = await db.query.round.findMany({
			where: eq(round.competitionId, competitionId),
			with: { fixtures: true },
		})
		const teamIds = new Set<string>()
		for (const r of compRounds) {
			for (const f of r.fixtures) {
				teamIds.add(f.homeTeamId)
				teamIds.add(f.awayTeamId)
			}
		}
		if (teamIds.size > 0) {
			const teams = await db.query.team.findMany({ where: inArray(team.id, [...teamIds]) })
			const untagged = teams.filter(
				(t) => (t.externalIds as Record<string, unknown> | null)?.fifa_pot == null,
			)
			if (untagged.length > 0) {
				return NextResponse.json(
					{
						error: 'pot-coverage-incomplete',
						message: `Cup mode needs FIFA pot tags on every team. ${untagged.length} team(s) are missing: ${untagged.map((t) => t.name).join(', ')}. Re-run the daily sync or check WC_2026_POTS.`,
					},
					{ status: 400 },
				)
			}
		}
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

	// Creator automatically joins the game. Lives are earned via underdog
	// picks in cup mode, not handed out — default 0. Form lets the creator
	// override if they want a more forgiving game.
	const creatorStartingLives = (modeConfig as { startingLives?: number } | null)?.startingLives ?? 0
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
