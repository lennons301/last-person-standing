import { bootstrapCompetitions } from '../src/lib/game/bootstrap-competitions'

async function main() {
	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	if (!apiKey) {
		console.warn('FOOTBALL_DATA_API_KEY not set — WC competition will be created but not synced')
	}
	await bootstrapCompetitions({ footballDataApiKey: apiKey })
	console.log('Bootstrap complete')
	process.exit(0)
}

main().catch((err) => {
	console.error('Bootstrap failed:', err)
	process.exit(1)
})
