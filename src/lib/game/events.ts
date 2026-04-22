export interface EventInput {
	gameId: string
	type:
		| 'round_opened'
		| 'deadline_approaching'
		| 'deadline_passed'
		| 'results_confirmed'
		| 'game_finished'
		| 'payment_reminder'
	payload: Record<string, unknown>
}

export async function writeEvent(input: EventInput): Promise<void> {
	// Phase 4a: log only. Phase 4b replaces this with a DB insert into the event table.
	console.info('[event]', input.type, { gameId: input.gameId, ...input.payload })
}
