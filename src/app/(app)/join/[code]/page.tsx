import { notFound, redirect } from 'next/navigation'
import { JoinGameCard } from '@/components/game/join-game-card'
import { requireSession } from '@/lib/auth-helpers'
import { getGameByInviteCode, getMembership } from '@/lib/game/join-query'
import { evaluateJoinability, JOIN_BLOCKED_COPY } from '@/lib/game/joinability'
import { buildPaymentLink, buildPaymentReference } from '@/lib/payments/payment-link'

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
	const session = await requireSession()
	const { code } = await params

	const game = await getGameByInviteCode(code)
	if (!game) notFound()

	const existing = await getMembership(game.id, session.user.id)
	if (existing) redirect(`/game/${game.id}`)

	// Someone following a link to a game that has started is told so here rather
	// than being shown a join button that 400s. The same rule the route enforces,
	// read from the same function.
	const { reason } = evaluateJoinability({
		game,
		startingRound: game.startingRound ?? null,
		now: new Date(),
	})
	const blocked = reason ? JOIN_BLOCKED_COPY[reason] : null

	const payUrl = buildPaymentLink({
		provider: game.creatorPaymentProvider,
		handle: game.creatorPaymentHandle,
		amount: game.entryFee,
		reference: buildPaymentReference(game.name, session.user.name),
	})

	return (
		<JoinGameCard
			gameId={game.id}
			name={game.name}
			mode={game.gameMode}
			competition={game.competition.name}
			playerCount={game.players.length}
			entryFee={game.entryFee}
			creatorName={game.creatorName}
			payUrl={payUrl}
			blocked={blocked}
		/>
	)
}
