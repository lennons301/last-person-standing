import { notFound } from 'next/navigation'
import { FormGuideView } from '@/components/picks/form-guide'
import { requireSession } from '@/lib/auth-helpers'
import { safeBackHref } from '@/lib/game/form-guide-link'
import { getTeamFormGuide } from '@/lib/game/team-form-guide'

/**
 * A team's full form guide, scoped to a competition rather than a game — the
 * same page for every player on that competition, whichever game brought them
 * here.
 *
 * Two optional search params carry the context the caller had:
 * - `opponent` — the other team in the fixture the guide was opened from. The
 *   only thing that brings out head-to-head.
 * - `from` — an in-app path to return to (the game page). Narrowed by
 *   `safeBackHref` to a same-origin relative path so the back link can't be
 *   pointed off-site.
 */
export default async function TeamFormGuidePage({
	params,
	searchParams,
}: {
	params: Promise<{ competitionId: string; teamId: string }>
	searchParams: Promise<{ opponent?: string; from?: string }>
}) {
	await requireSession()
	const { competitionId, teamId } = await params
	const { opponent, from } = await searchParams

	const guide = await getTeamFormGuide(teamId, competitionId, opponent)
	if (!guide) notFound()

	return <FormGuideView guide={guide} backHref={safeBackHref(from)} backLabel="Back to game" />
}
