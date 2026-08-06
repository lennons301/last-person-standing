import { notFound, redirect } from 'next/navigation'
import { JoinGameCard } from '@/components/game/join-game-card'
import { requireSession } from '@/lib/auth-helpers'
import { getGameByInviteCode, getMembership } from '@/lib/game/join-query'
import { buildPaymentLink, buildPaymentReference } from '@/lib/payments/payment-link'

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
	const session = await requireSession()
	const { code } = await params

	const game = await getGameByInviteCode(code)
	if (!game) notFound()

	const existing = await getMembership(game.id, session.user.id)
	if (existing) redirect(`/game/${game.id}`)

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
		/>
	)
}
