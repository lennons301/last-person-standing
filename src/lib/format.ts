export function formatDeadline(deadline: Date): string {
	const now = new Date()
	const diffMs = deadline.getTime() - now.getTime()

	if (diffMs < 0) return 'Passed'

	const diffMins = Math.floor(diffMs / 60000)
	if (diffMins < 60) return `${diffMins}m`

	const diffHours = Math.floor(diffMins / 60)
	if (diffHours < 24) {
		const mins = diffMins % 60
		return `${diffHours}h ${mins}m`
	}

	const diffDays = Math.floor(diffHours / 24)
	return `${diffDays}d`
}
