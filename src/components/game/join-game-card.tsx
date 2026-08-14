'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PayLinkButton } from './pay-link-button'

interface JoinGameCardProps {
	gameId: string
	name: string
	mode: string
	competition: string
	playerCount: number
	entryFee: string | null
	creatorName: string
	/**
	 * Pre-filled pay link for the creator, or null when they've saved no handle
	 * (then the card keeps today's "collect payment separately" line).
	 */
	payUrl: string | null
	/**
	 * Why this game can't be joined from a link, or null when it can — see
	 * `evaluateJoinability`. Set means no join button and no payment prompt: there
	 * is nothing to pay for, and offering either would be offering something that
	 * fails. The card still names the game, so the person following the link knows
	 * which one it was.
	 */
	blocked?: { heading: string; message: string } | null
}

export function JoinGameCard({
	gameId,
	name,
	mode,
	competition,
	playerCount,
	entryFee,
	creatorName,
	payUrl,
	blocked = null,
}: JoinGameCardProps) {
	const router = useRouter()
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleJoin() {
		setLoading(true)
		setError(null)
		const res = await fetch(`/api/games/${gameId}/join`, { method: 'POST' })
		setLoading(false)
		if (!res.ok) {
			const body = await res.json().catch(() => ({ error: 'Failed to join' }))
			// `message` where the route sends one (its `error` is a code there —
			// 'game-started' and friends), the older sentence-shaped `error` otherwise.
			// The started case reaches here when the deadline passes between this page
			// rendering and the button being pressed.
			setError(body.message ?? body.error ?? 'Failed to join')
			return
		}
		router.push(`/game/${gameId}`)
	}

	return (
		<Card className="p-6 max-w-md mx-auto mt-12">
			<h1 className="font-display text-2xl font-semibold mb-1">{name}</h1>
			<p className="text-sm text-muted-foreground mb-4">Created by {creatorName}</p>

			<div className="space-y-1.5 text-sm mb-5">
				<div>
					<span className="text-muted-foreground">Mode:</span>{' '}
					<span className="capitalize font-medium">{mode}</span>
				</div>
				<div>
					<span className="text-muted-foreground">Competition:</span>{' '}
					<span className="font-medium">{competition}</span>
				</div>
				<div>
					<span className="text-muted-foreground">Players:</span>{' '}
					<span className="font-medium">{playerCount}</span>
				</div>
				{entryFee && (
					<div>
						<span className="text-muted-foreground">Entry fee:</span>{' '}
						<span className="font-display font-semibold">£{entryFee}</span>
					</div>
				)}
			</div>

			{blocked ? (
				<div className="rounded-lg border border-border bg-muted/40 p-4">
					<p className="font-medium mb-1">{blocked.heading}</p>
					<p className="text-sm text-muted-foreground">{blocked.message}</p>
				</div>
			) : (
				<>
					{/* Paying is optional at this point — join now, pay later is always fine,
					    so the link sits above the join button rather than in its way. */}
					{entryFee &&
						(payUrl ? (
							<div className="mb-4 space-y-1.5">
								<PayLinkButton
									url={payUrl}
									creatorName={creatorName}
									amount={entryFee}
									className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--alive)] px-4 py-2 text-sm font-semibold text-[var(--alive)] hover:bg-[var(--alive-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
								/>
								<p className="text-xs text-muted-foreground">
									Opens {creatorName}'s payment link — pay by card, then mark it paid in the app.
									You can also join now and pay later.
								</p>
							</div>
						) : (
							<p className="text-xs text-muted-foreground mb-4 italic">
								Admin will collect payment separately.
							</p>
						))}

					{error && <p className="text-sm text-[var(--eliminated)] mb-2">{error}</p>}

					<Button onClick={handleJoin} disabled={loading} className="w-full" size="lg">
						{loading ? 'Joining...' : 'Join game'}
					</Button>
				</>
			)}
		</Card>
	)
}
