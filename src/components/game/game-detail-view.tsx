'use client'

import { useState } from 'react'
import { GameHeader } from '@/components/game/game-header'
import { ShareDialog } from '@/components/game/share-dialog'
import { CupStandings } from '@/components/standings/cup-standings'
import { type GridPlayer, type GridRound, ProgressGrid } from '@/components/standings/progress-grid'
import { type TurboRoundSummary, TurboStandings } from '@/components/standings/turbo-standings'
import type { CupLadderData } from '@/lib/game/cup-standings-queries'

interface GameDetailViewProps {
	game: {
		id: string
		name: string
		gameMode: string
		competition: string
		pot: string
		entryFee: string | null
		playerCount: number
		aliveCount: number
		status: string
		inviteCode: string
	}
	pickSection: React.ReactNode
	classicGrid?: {
		rounds: GridRound[]
		players: GridPlayer[]
		aliveCount: number
		eliminatedCount: number
		pot: string
	} | null
	turboStandings?: {
		rounds: TurboRoundSummary[]
		numberOfPicks: number
	} | null
	cupStandings?: CupLadderData | null
}

export function GameDetailView({
	game,
	pickSection,
	classicGrid,
	turboStandings,
	cupStandings,
}: GameDetailViewProps) {
	const [shareOpen, setShareOpen] = useState(false)
	const inviteUrl =
		typeof window !== 'undefined' ? `${window.location.origin}/join/${game.inviteCode}` : ''

	return (
		<div>
			<GameHeader
				name={game.name}
				mode={game.gameMode}
				competition={game.competition}
				pot={game.pot}
				entryFee={game.entryFee}
				playerCount={game.playerCount}
				aliveCount={game.aliveCount}
				status={game.status}
				inviteCode={game.inviteCode}
				onShare={() => setShareOpen(true)}
			/>

			<div className="mb-6">{pickSection}</div>

			{classicGrid && (
				<ProgressGrid
					rounds={classicGrid.rounds}
					players={classicGrid.players}
					aliveCount={classicGrid.aliveCount}
					eliminatedCount={classicGrid.eliminatedCount}
					pot={classicGrid.pot}
					gameId={game.id}
					onShare={() => setShareOpen(true)}
				/>
			)}

			{turboStandings && (
				<TurboStandings
					rounds={turboStandings.rounds}
					numberOfPicks={turboStandings.numberOfPicks}
					onShare={() => setShareOpen(true)}
				/>
			)}

			{cupStandings && <CupStandings data={cupStandings} onShare={() => setShareOpen(true)} />}

			<ShareDialog
				open={shareOpen}
				onOpenChange={setShareOpen}
				gameId={game.id}
				gameName={game.name}
				pot={game.pot}
				inviteUrl={inviteUrl}
				inviteCode={game.inviteCode}
			/>
		</div>
	)
}
