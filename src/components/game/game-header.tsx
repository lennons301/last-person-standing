'use client'

import { Share2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PotBreakdown } from '@/lib/game-logic/prizes'

interface GameHeaderProps {
	name: string
	mode: string
	competition: string
	potBreakdown: PotBreakdown
	target: string
	unpaid: string
	entryFee: string | null
	playerCount: number
	aliveCount: number
	status: string
	inviteCode: string
	onShare: () => void
}

export function GameHeader({
	name,
	mode,
	competition,
	potBreakdown,
	target,
	unpaid,
	entryFee,
	playerCount,
	aliveCount,
	inviteCode,
	onShare,
}: GameHeaderProps) {
	const hasPending = potBreakdown.pending !== '0.00'
	const hasUnpaid = unpaid !== '0.00'

	return (
		<div className="mb-6 bg-card border border-border rounded-xl overflow-hidden">
			<div className="p-5 flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="font-display text-2xl md:text-3xl font-semibold leading-tight">{name}</h1>
					<p className="text-sm text-muted-foreground mt-1">
						<span className="capitalize font-medium text-foreground">{mode}</span> · {competition}
					</p>
					<div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
						<Users className="h-3.5 w-3.5" />
						<span>
							{aliveCount} alive / {playerCount} players
						</span>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<div className="text-right">
						<div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold">
							Pot (confirmed)
						</div>
						<div className="font-display text-3xl md:text-4xl font-bold leading-none">
							£{potBreakdown.confirmed}
						</div>
						<div className="text-[0.7rem] text-muted-foreground mt-1">
							{hasPending && <span>£{potBreakdown.pending} awaiting confirmation · </span>}
							{hasUnpaid && <span>£{unpaid} unpaid · </span>}
							<span>£{target} target</span>
						</div>
						{entryFee && (
							<div className="text-[0.65rem] text-muted-foreground mt-0.5">£{entryFee} entry</div>
						)}
					</div>
				</div>
			</div>

			<div className="border-t border-border bg-muted/30 px-5 py-2 flex items-center justify-between gap-3 flex-wrap">
				<div className="text-xs text-muted-foreground">
					Invite code: <span className="font-mono font-semibold text-foreground">{inviteCode}</span>
				</div>
				<Button variant="outline" size="sm" onClick={onShare} className="gap-1.5">
					<Share2 className="h-3.5 w-3.5" />
					Share
				</Button>
			</div>
		</div>
	)
}
