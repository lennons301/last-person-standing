import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { competition } from '@/lib/schema/competition'

export async function getActiveCompetitions() {
	return db.query.competition.findMany({
		where: eq(competition.status, 'active'),
	})
}
