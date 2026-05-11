import { CreateGameForm } from '@/components/game/create-game-form'
import { getActiveCompetitions } from '@/lib/game/competitions-query'

export default async function CreateGamePage() {
	const competitions = await getActiveCompetitions()
	return (
		<CreateGameForm
			competitions={competitions.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
		/>
	)
}
