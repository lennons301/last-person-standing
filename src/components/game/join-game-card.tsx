'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface JoinGameCardProps {
	gameId: string
	name: string
	mode: string
	competition: string
	playerCount: number
	entryFee: string | null
	creatorName: string
}

export function JoinGameCard({
	gameId,
	name,
	mode,
	competition,
	playerCount,
	entryFee,
	creatorName,
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
			setError(body.error ?? 'Failed to join')
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

			{entryFee && (
				<p className="text-xs text-muted-foreground mb-4 italic">
					Admin will collect payment separately.
				</p>
			)}

			{error && <p className="text-sm text-[var(--eliminated)] mb-2">{error}</p>}

			<Button onClick={handleJoin} disabled={loading} className="w-full" size="lg">
				{loading ? 'Joining...' : 'Join game'}
			</Button>
		</Card>
	)
}
