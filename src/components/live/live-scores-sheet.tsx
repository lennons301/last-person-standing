'use client'
import { ChevronUpIcon } from 'lucide-react'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'
import { countLiveFixtures, hasLiveAction, viewerPicksByFixture } from '@/lib/live/board'
import { LiveDot, ReconnectingChip } from './live-indicators'
import { LiveScoresPanel } from './live-scores-panel'
import { useLiveGame } from './use-live-game'

/**
 * On-demand reference scoreboard. Replaces the always-on ticker band: the page
 * stays calm and raw match scores live one tap away, behind a control that only
 * appears while there is live action (a fixture in play). The hero (personal
 * live read) and standings (field view) remain the only unprompted live
 * surfaces.
 */
export function LiveScoresSheet() {
	const { payload, reconnecting } = useLiveGame()
	if (!payload) return null

	const now = new Date()
	if (!hasLiveAction(payload.fixtures, now)) return null

	const liveCount = countLiveFixtures(payload.fixtures, now)
	const viewerPicks = viewerPicksByFixture(payload)

	return (
		<div className="mb-4">
			<Sheet>
				<SheetTrigger asChild>
					<button
						type="button"
						className="inline-flex items-center gap-2 rounded-full border border-[#ef4444]/50 bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
					>
						<LiveDot className="text-[#ef4444]" />
						Live scores
						<span className="font-medium text-muted-foreground">
							{liveCount} {liveCount === 1 ? 'match' : 'matches'} in play
						</span>
						<ChevronUpIcon className="size-3.5 text-muted-foreground" />
					</button>
				</SheetTrigger>
				<SheetContent side="bottom" className="max-h-[85vh]">
					<SheetHeader className="pb-0">
						<SheetTitle className="flex items-center gap-2 text-base">
							Live scores
							{reconnecting && <ReconnectingChip />}
						</SheetTitle>
						<SheetDescription>
							Every match in this round. Scores refresh on their own.
						</SheetDescription>
					</SheetHeader>
					<div className="overflow-y-auto px-4 pb-6">
						<LiveScoresPanel
							fixtures={payload.fixtures}
							viewerPicksByFixture={viewerPicks}
							now={now}
						/>
					</div>
				</SheetContent>
			</Sheet>
		</div>
	)
}
