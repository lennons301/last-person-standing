import { eq } from 'drizzle-orm'
import { PlayerSummaryView } from '@/components/me/player-summary-view'
import { SettingsFold } from '@/components/me/settings-fold'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { CAREER, getMeSummary } from '@/lib/game/me-summary-query'
import { parseTeamSeasonFilters } from '@/lib/game/me-summary-view'
import { user } from '@/lib/schema/auth'

export const metadata = { title: 'Your summary' }

/**
 * The player's own summary — private by construction. The route takes no
 * parameters, so the only summary anybody can open is their own: the user comes
 * from the session and nowhere else. There is deliberately no share link and no
 * OG image for this page.
 *
 * The search params carry one season per competition family (`?teams-<family
 * key>=<season>`), which narrows that family's team block and nothing else. In
 * the URL rather than in client state so a selection survives a refresh and
 * travels in a link — and so this page stays a server component with one query
 * behind it.
 */
export default async function MySummaryPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
	const session = await requireSession()
	const summary = await getMeSummary(session.user.id, {
		...CAREER,
		teamSeasons: parseTeamSeasonFilters(await searchParams),
	})

	// The player's own settings, read straight from their user row rather than
	// through the summary builder: a payment handle is a setting, not a figure,
	// and putting it through `buildMeSummaryView` would make that seam a
	// dumping ground for anything the page happens to show.
	const [me] = await db
		.select({ paymentProvider: user.paymentProvider, paymentHandle: user.paymentHandle })
		.from(user)
		.where(eq(user.id, session.user.id))
		.limit(1)

	return (
		<>
			<PlayerSummaryView summary={summary} />
			{/* Below the record, and folded: a player who has only ever joined games
			    still has somewhere to set the handle they'll be paid on. */}
			<SettingsFold
				paymentProvider={me?.paymentProvider ?? null}
				paymentHandle={me?.paymentHandle ?? null}
			/>
		</>
	)
}
