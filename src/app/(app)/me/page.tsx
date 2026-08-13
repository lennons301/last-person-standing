import { PlayerSummaryView } from '@/components/me/player-summary-view'
import { requireSession } from '@/lib/auth-helpers'
import { getMeSummary } from '@/lib/game/me-summary-query'

export const metadata = { title: 'Your summary' }

/**
 * The player's own summary — private by construction. The route takes no
 * parameters, so the only summary anybody can open is their own: the user comes
 * from the session and nowhere else. There is deliberately no share link and no
 * OG image for this page.
 */
export default async function MySummaryPage() {
	const session = await requireSession()
	const summary = await getMeSummary(session.user.id)

	return <PlayerSummaryView summary={summary} />
}
