'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { loadTeamFormDetail } from '@/app/actions/team-form'
import { formGuidePath } from '@/lib/game/form-guide-link'
import type { TeamFormDetail } from '@/lib/game/team-form-detail'
import { type FixtureSummaryView, type FormMarket, TeamFormSheetView } from './team-form-panel'

interface TeamFormSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	teamId: string
	competitionId: string
	/**
	 * The other side of the fixture the sheet was opened from. The sheet itself
	 * shows one team's own season — this only travels on to the form guide, which
	 * is where head-to-head lives.
	 */
	opponentTeamId?: string
	beforeRoundNumber?: number
	/**
	 * The fixture's full 1X2, passed straight through: it comes down with the
	 * caller's row, so it needs none of this component's loading.
	 */
	market?: FormMarket | null
	// Used for the loading-state header so the sheet doesn't pop in empty.
	teamPreview: { name: string; shortName: string; badgeUrl?: string | null }
	/**
	 * The specific fixture the sheet was opened from — comes down with the
	 * caller's cell/row like `market` does, no loading of its own.
	 */
	fixtureSummary?: FixtureSummaryView
}

/**
 * The data-loading half of the form-detail sheet: fetches `TeamFormDetail`
 * through a server action when the sheet opens and hands it to the
 * presentational `TeamFormSheetView`. Everything visual lives in
 * `team-form-panel.tsx`, which is what the `/preview/picks` gallery renders
 * (this component can't be used there — the server action hits the database).
 */
export function TeamFormSheet({
	open,
	onOpenChange,
	teamId,
	competitionId,
	opponentTeamId,
	beforeRoundNumber,
	market = null,
	teamPreview,
	fixtureSummary,
}: TeamFormSheetProps) {
	// The page the sheet was opened from, so the guide can offer a way back to
	// it. The guide itself stays game-agnostic — this is the only place that
	// knows where the player came from.
	const pathname = usePathname()
	const [detail, setDetail] = useState<TeamFormDetail | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!open) return
		let cancelled = false
		setLoading(true)
		setError(null)
		loadTeamFormDetail({ teamId, competitionId, beforeRoundNumber })
			.then((result) => {
				if (cancelled) return
				if (!result) setError('Could not load team form')
				else setDetail(result)
			})
			.catch(() => {
				if (!cancelled) setError('Could not load team form')
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [open, teamId, competitionId, beforeRoundNumber])

	return (
		<TeamFormSheetView
			open={open}
			onOpenChange={onOpenChange}
			detail={detail}
			loading={loading}
			error={error}
			market={market}
			teamPreview={teamPreview}
			fixtureSummary={fixtureSummary}
			formGuideHref={formGuidePath(competitionId, teamId, {
				opponent: opponentTeamId,
				from: pathname,
			})}
		/>
	)
}
