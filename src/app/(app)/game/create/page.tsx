import { eq } from 'drizzle-orm'
import { CreateGameForm } from '@/components/game/create-game-form'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { getActiveCompetitions } from '@/lib/game/competitions-query'
import { user } from '@/lib/schema/auth'

export default async function CreateGamePage() {
	const session = await requireSession()
	const competitions = await getActiveCompetitions()

	// Pre-fill "where do players pay you?" from the creator's own record, so the
	// handle is a set-once field rather than something to retype every game.
	const [me] = await db
		.select({ paymentProvider: user.paymentProvider, paymentHandle: user.paymentHandle })
		.from(user)
		.where(eq(user.id, session.user.id))
		.limit(1)

	return (
		<CreateGameForm
			competitions={competitions.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
			savedPaymentProvider={me?.paymentProvider ?? null}
			savedPaymentHandle={me?.paymentHandle ?? null}
		/>
	)
}
