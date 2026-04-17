import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { formatDeadline } from '@/lib/format'
import type { DashboardGame } from '@/lib/game/queries'
import { StatusBadge } from './status-badge'

interface GameCardProps {
	game: DashboardGame
}

export function GameCard({ game }: GameCardProps) {
	const isCompleted = game.status === 'completed'
	const isEliminated = game.myStatus === 'eliminated'
	const needsPick = !game.myPickSubmitted && game.myStatus === 'alive' && game.currentRoundName
	const modeLabel = game.gameMode[0].toUpperCase() + game.gameMode.slice(1)

	return (
		<Link href={`/game/${game.id}`}>
			<Card
				className={`p-5 hover:shadow-md transition-shadow cursor-pointer ${
					isCompleted || isEliminated ? 'opacity-60' : ''
				}`}
			>
				<div className="flex justify-between items-start mb-2">
					<h2 className="font-display font-semibold text-lg">{game.name}</h2>
					<StatusBadge status={isCompleted ? 'winner' : game.myStatus} />
				</div>

				<div className="flex gap-4 text-sm text-muted-foreground mb-3 flex-wrap">
					<span>
						{modeLabel} · {game.competition}
					</span>
					<span>
						{game.playerCount} players · {game.aliveCount} alive
					</span>
					<span className="font-display font-semibold text-foreground">£{game.pot} pot</span>
				</div>

				{!isCompleted && !isEliminated && (
					<div className="pt-3 border-t flex justify-between items-center">
						{needsPick ? (
							<span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-[var(--draw-bg)] text-[var(--draw)]">
								⚡ Make your pick — {game.currentRoundName}
							</span>
						) : (
							<span className="text-xs font-semibold text-[var(--alive)]">✓ Picks submitted</span>
						)}
						{game.currentRoundDeadline && (
							<span className="text-xs text-muted-foreground">
								{formatDeadline(game.currentRoundDeadline)}
							</span>
						)}
					</div>
				)}

				{game.isAdmin && game.unpaidCount > 0 && !isCompleted && (
					<div className="mt-2 text-xs text-[var(--eliminated)] font-medium">
						⚠ {game.unpaidCount} unpaid
					</div>
				)}
			</Card>
		</Link>
	)
}
