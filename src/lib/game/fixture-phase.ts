export type FixtureRecordStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'

export interface FixturePhaseInfo {
	phase: 'pre_match' | 'result'
	statusLabel: string
}

/**
 * What a tapped pick cell should reveal: fixture details before kickoff, or
 * the match result once there's a scoreline to show. 'live' and 'cancelled'
 * both read as `result` — a live score and "cancelled" are each "other
 * available details" a pre-match view has nothing to offer.
 */
export function describeFixturePhase(status: FixtureRecordStatus): FixturePhaseInfo {
	switch (status) {
		case 'scheduled':
			return { phase: 'pre_match', statusLabel: 'Kicks off' }
		case 'postponed':
			return { phase: 'pre_match', statusLabel: 'Postponed' }
		case 'live':
			return { phase: 'result', statusLabel: 'Live' }
		case 'finished':
			return { phase: 'result', statusLabel: 'Full-time' }
		case 'cancelled':
			return { phase: 'result', statusLabel: 'Cancelled' }
	}
}
