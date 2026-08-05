'use client'

import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { GameRulesDialog } from '@/components/game/game-rules-dialog'
import { Button } from '@/components/ui/button'

interface GameIdentityBarProps {
	name: string
	mode: string
	competition: string
	/** Shown inside the rules dialog — it no longer sits on the page itself. */
	entryFee: string | null
	onShare: () => void
}

/**
 * Thin identity strip at the top of the game page: which game this is, which
 * mode it plays by (tap the chip for the rules), and how to share it. It
 * replaces the old four-band header card — the pot, the player counts and the
 * round now belong to the stat line and the hero, and the invite code lives in
 * the share flow.
 *
 * Deliberately modest: the title is a heading, not a billboard. The loudest
 * thing on the page should be whatever the player has to do next.
 */
export function GameIdentityBar({
	name,
	mode,
	competition,
	entryFee,
	onShare,
}: GameIdentityBarProps) {
	const [rulesOpen, setRulesOpen] = useState(false)

	return (
		<div className="mb-3 flex items-center justify-between gap-3">
			<div className="min-w-0">
				<h1 className="font-display text-lg md:text-xl font-semibold leading-tight truncate">
					{name}
				</h1>
				<div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
					<button
						type="button"
						onClick={() => setRulesOpen(true)}
						aria-label={`How ${mode} mode works`}
						className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 font-medium text-foreground capitalize hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					>
						{mode}
						<span aria-hidden className="text-muted-foreground normal-case">
							· rules
						</span>
					</button>
					<span className="truncate">{competition}</span>
				</div>
			</div>

			<Button variant="ghost" size="sm" onClick={onShare} className="shrink-0 gap-1.5">
				<Share2 aria-hidden className="h-3.5 w-3.5" />
				Share
			</Button>

			<GameRulesDialog
				mode={mode}
				entryFee={entryFee}
				open={rulesOpen}
				onOpenChange={setRulesOpen}
			/>
		</div>
	)
}
