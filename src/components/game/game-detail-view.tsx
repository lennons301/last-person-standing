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
import { RebuyActions, RebuyPendingNotice } from '@/components/game/rebuy-actions'
import { RoundStrip, type RoundStripInfo } from '@/components/game/round-strip'
import { SettleUpNotice } from '@/components/game/settle-up-notice'
import { ShareDialog } from '@/components/game/share-dialog'
import { VoidedPickBanner } from '@/components/game/voided-pick-banner'
import { LiveProvider } from '@/components/live/live-provider'
import { LiveScoreTicker } from '@/components/live/live-score-ticker'
import { CupStandings } from '@/components/standings/cup-standings'
import { type GridPlayer, type GridRound, ProgressGrid } from '@/components/standings/progress-grid'
import { type TurboRoundSummary, TurboStandings } from '@/components/standings/turbo-standings'
import type { CupLadderData } from '@/lib/game/cup-standings-queries'
import type { GameViewDescriptor } from '@/lib/game/game-view'
import type { PotBreakdown } from '@/lib/game-logic/prizes'

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
	/**
	 * The standing rebuy offer, when there is one. The hero owns the offer itself
	 * (`view.hero.kind === 'rebuy'`); this supplies the buttons behind it, and the
	 * pending-payment notice for a player who has already bought back in.
	 */
	rebuy?: {
		entryFee: string
		pendingPayment: { id: string; amount: string } | null
	} | null
	cupStandings?: CupLadderData | null
}

export function GameDetailView({
	game,
	view,
	pickSection,
	classicGrid,
	turboStandings,
	rebuy,
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

	// Auto-pick, voided-pick and pending-rebuy notices belong to the state the
	// hero is describing, so they render inside it rather than as standalone
	// banners above the page. When there's no hero at all they fall back to their
	// original spot at the top. The pending-rebuy notice stands down when the
	// hero is the rebuy variant — that already carries the claim CTA. Today that
	// guard never fires (a pending rebuy means the player is alive again, so
	// their hero is a pick state); it's here so the two can't both render if the
	// eligibility rule ever changes.
	const notices = (
		<>
			{game.myCurrentRoundPick?.isAuto && (
				<AutoPickBanner
					pickId={game.myCurrentRoundPick.id}
					teamShortName={game.myCurrentRoundPick.teamShortName}
					kickoffLabel={game.myCurrentRoundPick.kickoffLabel}
				/>
			)}
			{rebuy?.pendingPayment && view.hero.kind !== 'rebuy' && (
				<RebuyPendingNotice
					gameId={game.id}
					entryFee={rebuy.entryFee}
					pendingPayment={rebuy.pendingPayment}
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
					<GameHero
						hero={view.hero}
						notices={<div className="mt-4 space-y-2">{notices}</div>}
						rebuyAction={
							rebuy ? (
								<RebuyActions
									gameId={game.id}
									entryFee={rebuy.entryFee}
									pendingPayment={rebuy.pendingPayment}
									size="lg"
								/>
							) : null
						}
					/>
				)}

				{/* `id` is the target of the hero's CTA / "Change pick" affordance. */}
				<div id="pick" className="mb-6 scroll-mt-4">
					{pickSection}
				</div>

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
