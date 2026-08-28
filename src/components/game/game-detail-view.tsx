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
import { RebuyActions, RebuyOfferNotice, RebuyPendingNotice } from '@/components/game/rebuy-actions'
import { RoundStrip, type RoundStripInfo } from '@/components/game/round-strip'
import { RoundSummaryCard } from '@/components/game/round-summary-card'
import { SettleUpNotice } from '@/components/game/settle-up-notice'
import { ShareDialog } from '@/components/game/share-dialog'
import { VoidedPickBanner } from '@/components/game/voided-pick-banner'
import { LiveProvider } from '@/components/live/live-provider'
import { LiveScoresSheet } from '@/components/live/live-scores-sheet'
import { CupStandings } from '@/components/standings/cup-standings'
import { type GridPlayer, type GridRound, ProgressGrid } from '@/components/standings/progress-grid'
import { type TurboRoundSummary, TurboStandings } from '@/components/standings/turbo-standings'
import type { CupLadderData } from '@/lib/game/cup-standings-queries'
import type { GameViewDescriptor } from '@/lib/game/game-view'
import type { RoundSummaryView } from '@/lib/game/round-summary-view'
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
		/** `modeConfig.allowRebuys` — classic only. Forwarded to the rules dialog. */
		allowRebuys?: boolean
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
		/** Threaded to `ProgressGrid` so a tapped cell can open the fixture-detail sheet (#226). */
		competitionId: string
	} | null
	turboStandings?: {
		rounds: TurboRoundSummary[]
		numberOfPicks: number
	} | null
	/**
	 * The standing rebuy offer, when there is one. Derived from the *viewer's* own
	 * membership, not the acting-as target's. The hero owns the offer whenever it
	 * is the viewer's own lens (`view.hero.kind === 'rebuy'`) and this supplies
	 * its buttons; otherwise the notice slot carries it, so the offer and the
	 * pending-payment claim are reachable from every state.
	 */
	rebuy?: {
		entryFee: string
		closesAt: Date
		pendingPayment: { id: string; amount: string } | null
		creatorName: string
		/** Pre-filled pay-the-creator link for the rebuy amount (null: no handle). */
		payUrl?: string | null
	} | null
	cupStandings?: CupLadderData | null
	/**
	 * The latest locked round's summary — the card under the progress grid and the
	 * prose in the share dialog, both out of one derivation. Null for every mode
	 * but classic, and until one of this game's deadlines has passed.
	 */
	roundSummary?: { view: RoundSummaryView; text: string } | null
}

export function GameDetailView({
	game,
	view,
	pickSection,
	classicGrid,
	turboStandings,
	rebuy,
	cupStandings,
	roundSummary,
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
	// original spot at the top. The rebuy notices stand down when the hero is the
	// rebuy variant — that already carries the offer and its CTA.
	//
	// The offer half is the fallback for the one case the hero can't cover: the
	// hero renders the *target's* lens, while `rebuy` comes from the viewer's own
	// membership, so an admin who is themselves eliminated would otherwise lose
	// their own rebuy button for as long as `?actingAs=` is set.
	const notices = (
		<>
			{game.myCurrentRoundPick?.isAuto && (
				<AutoPickBanner
					pickId={game.myCurrentRoundPick.id}
					teamShortName={game.myCurrentRoundPick.teamShortName}
					kickoffLabel={game.myCurrentRoundPick.kickoffLabel}
				/>
			)}
			{rebuy &&
				view.hero.kind !== 'rebuy' &&
				(rebuy.pendingPayment ? (
					<RebuyPendingNotice
						gameId={game.id}
						entryFee={rebuy.entryFee}
						pendingPayment={rebuy.pendingPayment}
						creatorName={rebuy.creatorName}
						payUrl={rebuy.payUrl}
					/>
				) : (
					<RebuyOfferNotice
						gameId={game.id}
						entryFee={rebuy.entryFee}
						closesAt={rebuy.closesAt}
						creatorName={rebuy.creatorName}
					/>
				))}
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
				{/* Reference scores are on-demand — a control, not a permanent band,
				    and only while there's live action to check. */}
				<LiveScoresSheet />

				<GameIdentityBar
					name={game.name}
					mode={game.gameMode}
					competition={game.competition}
					entryFee={game.entryFee}
					allowRebuys={game.allowRebuys}
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
					<GameHero
						hero={view.hero}
						notices={<div className="mt-4 space-y-2">{notices}</div>}
						rebuyAction={
							rebuy ? (
								<RebuyActions
									gameId={game.id}
									entryFee={rebuy.entryFee}
									pendingPayment={rebuy.pendingPayment}
									creatorName={rebuy.creatorName}
									payUrl={rebuy.payUrl}
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
						competitionId={classicGrid.competitionId}
					/>
				)}

				{/* Directly beneath the grid, because the grid is what reveals the picks
				    this narrates. */}
				{roundSummary && <RoundSummaryCard summary={roundSummary.view} />}

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
					roundSummaryText={roundSummary?.text ?? null}
				/>
			</div>
		</LiveProvider>
	)
}
