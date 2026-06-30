const LIVE_WINDOW_BEFORE_MS = 10 * 60 * 1000
// A knockout tie that goes to extra time + a penalty shootout finishes roughly
// three hours after kickoff (90' + stoppage + 15' half-time + 30' ET + breaks +
// the shootout). The window must stay open past that, or the poll chain
// terminates before the FINISHED transition (and the penalty winner) can be
// observed — the NED v MAR R32 incident, where the 150-minute window closed ~30
// minutes before the shootout ended. 210 minutes covers the worst case with
// margin for football-data's status-flip lag.
const LIVE_WINDOW_AFTER_MS = 210 * 60 * 1000

const TERMINAL_STATUSES = new Set(['finished', 'cancelled'])

export function isFixtureInLiveWindow(
	kickoff: Date | null | undefined,
	now: Date = new Date(),
): boolean {
	if (!kickoff) return false
	const t = kickoff.getTime()
	const n = now.getTime()
	return n >= t - LIVE_WINDOW_BEFORE_MS && n <= t + LIVE_WINDOW_AFTER_MS
}

export function hasActiveFixture(
	fixtures: Array<{ kickoff: Date | null | undefined; status?: string | null }>,
	now: Date = new Date(),
): boolean {
	// A fixture is "active" (worth polling) when it's inside its live window AND
	// not already in a terminal state. The terminal exclusion lets the chain
	// self-terminate promptly once every fixture has finished, instead of polling
	// idle until the (now longer) window edge — important given the QStash quota.
	// Status is optional so callers that only have kickoffs still get the
	// time-based gate.
	return fixtures.some(
		(f) =>
			isFixtureInLiveWindow(f.kickoff, now) &&
			!(f.status != null && TERMINAL_STATUSES.has(f.status)),
	)
}
