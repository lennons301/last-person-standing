const LIVE_WINDOW_BEFORE_MS = 10 * 60 * 1000
const LIVE_WINDOW_AFTER_MS = 150 * 60 * 1000

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
	fixtures: Array<{ kickoff: Date | null | undefined }>,
	now: Date = new Date(),
): boolean {
	return fixtures.some((f) => isFixtureInLiveWindow(f.kickoff, now))
}
