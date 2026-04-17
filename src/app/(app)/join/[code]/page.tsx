import { notFound, redirect } from 'next/navigation'
import { JoinGameCard } from '@/components/game/join-game-card'
import { requireSession } from '@/lib/auth-helpers'
import { getGameByInviteCode, getMembership } from '@/lib/game/join-query'

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
	const session = await requireSession()
	const { code } = await params

	const game = await getGameByInviteCode(code)
	if (!game) notFound()

	const existing = await getMembership(game.id, session.user.id)
	if (existing) redirect(`/game/${game.id}`)

	return (
		<JoinGameCard
			gameId={game.id}
			name={game.name}
			mode={game.gameMode}
			competition={game.competition.name}
			playerCount={game.players.length}
			entryFee={game.entryFee}
			creatorName={game.creatorName}
		/>
	)
}
