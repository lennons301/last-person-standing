'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AdminPanel } from '@/components/game/admin-panel'
import { AutoPickBanner } from '@/components/game/auto-pick-banner'
import { GameHeader } from '@/components/game/game-header'
import { MyPaymentStrip } from '@/components/game/my-payment-strip'
import { OtherPlayersPayments } from '@/components/game/other-players-payments'
import type { PaymentStatus } from '@/components/game/payment-status-chip'
import { type AdminPayment, PaymentsPanel } from '@/components/game/payments-panel'
import { ShareDialog } from '@/components/game/share-dialog'
import { LiveProvider } from '@/components/live/live-provider'
import { LiveScoreTicker } from '@/components/live/live-score-ticker'
import { CupStandings } from '@/components/standings/cup-standings'
import { type GridPlayer, type GridRound, ProgressGrid } from '@/components/standings/progress-grid'
import { type TurboRoundSummary, TurboStandings } from '@/components/standings/turbo-standings'
import type { CupLadderData } from '@/lib/game/cup-standings-queries'
import type { PotBreakdown } from '@/lib/game-logic/prizes'

interface GameDetailViewProps {
	game: {
		id: string
		name: string
		gameMode: string
		competition: string
		pot: PotBreakdown
		target: string
		unpaid: string
		entryFee: string | null
		playerCount: number
		aliveCount: number
		status: string
		inviteCode: string
		creatorName: string
		isAdmin: boolean
		myPayment: { id: string; status: PaymentStatus; amount: string } | null
		otherPayments: Array<{ userName: string; status: PaymentStatus; isRebuy: boolean }>
		adminPayments: AdminPayment[] | undefined
		myCurrentRoundPick: {
			id: string
			isAuto: boolean
			teamShortName: string
			kickoffLabel: string
		} | null
		defaultShareVariant: 'standings' | 'live' | 'winner'
		liveShareAvailable: boolean
		winnerShareAvailable: boolean
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
	const router = useRouter()
	const refresh = () => router.refresh()
	const inviteUrl =
		typeof window !== 'undefined' ? `${window.location.origin}/join/${game.inviteCode}` : ''

	return (
		<LiveProvider gameId={game.id}>
			<div>
				<LiveScoreTicker />

				{game.myCurrentRoundPick?.isAuto && (
					<AutoPickBanner
						pickId={game.myCurrentRoundPick.id}
						teamShortName={game.myCurrentRoundPick.teamShortName}
						kickoffLabel={game.myCurrentRoundPick.kickoffLabel}
					/>
				)}

				<GameHeader
					name={game.name}
					mode={game.gameMode}
					competition={game.competition}
					potBreakdown={game.pot}
					target={game.target}
					unpaid={game.unpaid}
					entryFee={game.entryFee}
					playerCount={game.playerCount}
					aliveCount={game.aliveCount}
					status={game.status}
					inviteCode={game.inviteCode}
					onShare={() => setShareOpen(true)}
				/>

				{game.myPayment && (
					<div className="mb-4">
						<MyPaymentStrip
							gameId={game.id}
							paymentId={game.myPayment.id}
							status={game.myPayment.status}
							amount={game.myPayment.amount}
							creatorName={game.creatorName}
							onClaimed={refresh}
						/>
					</div>
				)}

				{game.otherPayments.length > 0 && (
					<div className="mb-6">
						<OtherPlayersPayments payments={game.otherPayments} />
					</div>
				)}

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
						showAdminActions={game.isAdmin}
					/>
				)}

				{turboStandings && (
					<TurboStandings
						rounds={turboStandings.rounds}
						numberOfPicks={turboStandings.numberOfPicks}
						onShare={() => setShareOpen(true)}
						showAdminActions={game.isAdmin}
						gameId={game.id}
					/>
				)}

				{cupStandings && (
					<CupStandings
						data={cupStandings}
						onShare={() => setShareOpen(true)}
						showAdminActions={game.isAdmin}
						gameId={game.id}
					/>
				)}

				{game.isAdmin && (
					<div className="mt-6">
						<AdminPanel
							gameId={game.id}
							gameName={game.name}
							aliveCount={game.aliveCount}
							potTotal={game.pot.total}
						/>
					</div>
				)}

				{game.isAdmin && game.adminPayments && game.adminPayments.length > 0 && (
					<div className="mt-6">
						<PaymentsPanel
							gameId={game.id}
							gameName={game.name}
							inviteCode={game.inviteCode}
							totals={game.pot}
							payments={game.adminPayments}
							onChange={refresh}
						/>
					</div>
				)}

				<ShareDialog
					open={shareOpen}
					onOpenChange={setShareOpen}
					gameId={game.id}
					gameName={game.name}
					pot={game.pot.total}
					inviteUrl={inviteUrl}
					inviteCode={game.inviteCode}
					defaultVariant={game.defaultShareVariant}
					liveAvailable={game.liveShareAvailable}
					winnerAvailable={game.winnerShareAvailable}
				/>
			</div>
		</LiveProvider>
	)
}
