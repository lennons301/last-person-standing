'use client'

import { LiveContext, type LiveContextValue } from '@/components/live/live-provider'
import { LiveScoresSheet } from '@/components/live/live-scores-sheet'
import type { LivePayload } from '@/lib/live/types'

/**
 * Feeds `LiveScoresSheet` a static payload through the live context instead of
 * the polling provider, so the gallery stays database-free while exercising the
 * real control + pop-out (including the case where no control renders).
 */
export function PreviewLiveScores({
	payload,
	reconnecting = false,
}: {
	payload: LivePayload
	reconnecting?: boolean
}) {
	const value: LiveContextValue = {
		payload,
		events: { goals: [], settlements: [] },
		isStale: false,
		reconnecting,
	}
	return (
		<LiveContext.Provider value={value}>
			<LiveScoresSheet />
		</LiveContext.Provider>
	)
}
