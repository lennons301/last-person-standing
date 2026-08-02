import { bootstrapCompetitions } from '../src/lib/game/bootstrap-competitions'

async function main() {
	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	if (!apiKey) {
		console.error(
			'FOOTBALL_DATA_API_KEY not set — season detection needs football-data currentSeason; aborting',
		)
		process.exit(1)
	}
	await bootstrapCompetitions({ footballDataApiKey: apiKey })
	console.log('Bootstrap complete')
	process.exit(0)
}

main().catch((err) => {
	console.error('Bootstrap failed:', err)
	process.exit(1)
})
