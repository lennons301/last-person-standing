'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AutoPickBanner } from '@/components/game/auto-pick-banner'
import { GameHero } from '@/components/game/game-hero'
import { GameIdentityBar } from '@/components/game/game-identity-bar'
import { GameStatLine } from '@/components/game/game-stat-line'
import { ManageGameFold } from '@/components/game/manage-game-fold'
import type { PaymentStatus } from '@/components/game/payment-status-chip'
import type { AdminPayment } from '@/components/game/payments-panel'
import { RoundStrip, type RoundStripInfo } from '@/components/game/round-strip'
import { SettleUpNotice } from '@/components/game/settle-up-notice'
import { ShareDialog } from '@/components/game/share-dialog'
import { VoidedPickBanner } from '@/components/game/voided-pick-banner'
import { WinnerBanner, type WinnerBannerEntry } from '@/components/game/winner-banner'
import { LiveProvider } from '@/components/live/live-provider'
import { LiveScoreTicker } from '@/components/live/live-score-ticker'
import { CupStandings } from '@/components/standings/cup-standings'
import { type GridPlayer, type GridRound, ProgressGrid } from '@/components/standings/progress-grid'
import { type TurboRoundSummary, TurboStandings } from '@/components/standings/turbo-standings'
import type { CupLadderData } from '@/lib/game/cup-standings-queries'
import type { GameViewDescriptor } from '@/lib/game/game-view'
import type { PotBreakdown } from '@/lib/game-logic/prizes'
import type { PaymentProvider } from '@/lib/payments/payment-link'

interface GameDetailViewProps {
	game: {
		id: string
		name: string
		gameMode: string
		competition: string
		pot: PotBreakdown
		entryFee: string | null
		aliveCount: number
		status: string
		inviteCode: string
		creatorName: string
		isAdmin: boolean
		myPayment: { id: string; status: PaymentStatus; amount: string } | null
		/** Pre-filled link to pay the creator what the viewer owes, if any. */
		myPaymentPayUrl: string | null
		/** The creator's saved handle — only used by the admin's own editor. */
		creatorPaymentProvider: PaymentProvider | null
		creatorPaymentHandle: string | null
		adminPayments: AdminPayment[] | undefined
		myCurrentRoundPick: {
			id: string
			isAuto: boolean
			teamShortName: string
			kickoffLabel: string
		} | null
		currentRound: RoundStripInfo | null
		defaultShareVariant: 'standings' | 'live' | 'winner'
		liveShareAvailable: boolean
		winnerShareAvailable: boolean
	}
	/** State-driven top-of-page descriptor from `buildGameView`. */
	view: GameViewDescriptor
	pickSection: React.ReactNode
	classicGrid?: {
		rounds: GridRound[]
		players: GridPlayer[]
		aliveCount: number
		eliminatedCount: number
	} | null
	turboStandings?: {
		rounds: TurboRoundSummary[]
		numberOfPicks: number
	} | null
	winnerBanner?: {
		winners: WinnerBannerEntry[]
		runnerUpName?: string
	} | null
	cupStandings?: CupLadderData | null
}

export function GameDetailView({
	game,
	view,
	pickSection,
	classicGrid,
	turboStandings,
	winnerBanner,
	cupStandings,
}: GameDetailViewProps) {
	const [shareOpen, setShareOpen] = useState(false)
	// Query string (sort + filter) for the standings share image — set when the
	// user shares from the progress grid so the image mirrors the on-screen order.
	const [shareStandingsQuery, setShareStandingsQuery] = useState<string | undefined>(undefined)
	const openShare = (standingsQuery?: string) => {
		setShareStandingsQuery(standingsQuery)
		setShareOpen(true)
	}
	const router = useRouter()
	const refresh = () => router.refresh()
	const inviteUrl =
		typeof window !== 'undefined' ? `${window.location.origin}/join/${game.inviteCode}` : ''

	// Auto-pick + voided-pick notices belong to the pick state, so they render
	// inside the hero rather than as standalone banners above the page. When
	// there's no hero (post-deadline and other not-yet-migrated states) they fall
	// back to their original spot at the top.
	const notices = (
		<>
			{game.myCurrentRoundPick?.isAuto && (
				<AutoPickBanner
					pickId={game.myCurrentRoundPick.id}
					teamShortName={game.myCurrentRoundPick.teamShortName}
					kickoffLabel={game.myCurrentRoundPick.kickoffLabel}
				/>
			)}
			<VoidedPickBanner gameId={game.id} gameMode={game.gameMode as 'classic' | 'turbo' | 'cup'} />
		</>
	)

	// The viewer's own outstanding entry money. It rides the stat line as a quiet
	// aside rather than a band of its own — see `SettleUpNotice`.
	const owed =
		game.myPayment && game.myPayment.status !== 'paid' && game.myPayment.status !== 'refunded'
			? game.myPayment
			: null

	return (
		<LiveProvider gameId={game.id}>
			<div>
				<LiveScoreTicker />

				<GameIdentityBar
					name={game.name}
					mode={game.gameMode}
					competition={game.competition}
					entryFee={game.entryFee}
					onShare={() => openShare()}
				/>

				<GameStatLine
					stats={view.stats}
					className="mb-4 md:mb-6"
					unpaidNotice={
						owed && (
							<SettleUpNotice
								gameId={game.id}
								paymentId={owed.id}
								status={owed.status}
								amount={owed.amount}
								creatorName={game.creatorName}
								payUrl={game.myPaymentPayUrl}
								onClaimed={refresh}
							/>
						)
					}
				/>

				{!view.demote.roundStrip && game.currentRound && game.status !== 'completed' && (
					<RoundStrip round={game.currentRound} />
				)}

				{view.hero.kind === 'none' ? (
					<div className="mb-4 space-y-2">{notices}</div>
				) : (
					<GameHero hero={view.hero} notices={<div className="mt-4 space-y-2">{notices}</div>} />
				)}

				{/* `id` is the target of the hero's CTA / "Change pick" affordance. */}
				<div id="pick" className="mb-6 scroll-mt-4">
					{pickSection}
				</div>

				{winnerBanner && winnerBanner.winners.length > 0 && (
					<WinnerBanner winners={winnerBanner.winners} runnerUpName={winnerBanner.runnerUpName} />
				)}

				{classicGrid && (
					<ProgressGrid
						rounds={classicGrid.rounds}
						players={classicGrid.players}
						aliveCount={classicGrid.aliveCount}
						eliminatedCount={classicGrid.eliminatedCount}
						gameId={game.id}
						onShare={openShare}
						showAdminActions={game.isAdmin}
					/>
				)}

				{turboStandings && (
					<TurboStandings
						rounds={turboStandings.rounds}
						numberOfPicks={turboStandings.numberOfPicks}
						onShare={() => openShare()}
						showAdminActions={game.isAdmin}
						gameId={game.id}
					/>
				)}

				{cupStandings && (
					<CupStandings
						data={cupStandings}
						onShare={() => openShare()}
						showAdminActions={game.isAdmin}
						gameId={game.id}
					/>
				)}

				{game.isAdmin && (
					<ManageGameFold
						gameId={game.id}
						gameName={game.name}
						inviteCode={game.inviteCode}
						entryFee={game.entryFee}
						gameStatus={game.status}
						aliveCount={game.aliveCount}
						pot={game.pot}
						payments={game.adminPayments}
						paymentProvider={game.creatorPaymentProvider}
						paymentHandle={game.creatorPaymentHandle}
						onChange={refresh}
					/>
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
					standingsQuery={shareStandingsQuery}
				/>
			</div>
		</LiveProvider>
	)
}
