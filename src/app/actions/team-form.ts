'use server'

import { requireSession } from '@/lib/auth-helpers'
import { getTeamFormDetail, type TeamFormDetail } from '@/lib/game/team-form-detail'

export async function loadTeamFormDetail(input: {
	teamId: string
	competitionId: string
	opponentTeamId?: string
	beforeRoundNumber?: number
}): Promise<TeamFormDetail | null> {
	await requireSession()
	return getTeamFormDetail(
		input.teamId,
		input.competitionId,
		input.opponentTeamId,
		input.beforeRoundNumber,
	)
}
