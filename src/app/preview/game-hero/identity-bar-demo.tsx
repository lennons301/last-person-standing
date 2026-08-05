'use client'

import { GameIdentityBar } from '@/components/game/game-identity-bar'

/**
 * Gallery wrapper for `GameIdentityBar`: the real bar takes an `onShare`
 * callback, which a Server Component can't hand it. The share action opens the
 * share dialog on the live page; here it's deliberately inert.
 */
export function IdentityBarDemo({
	name,
	mode,
	competition,
	entryFee,
}: {
	name: string
	mode: string
	competition: string
	entryFee: string | null
}) {
	return (
		<GameIdentityBar
			name={name}
			mode={mode}
			competition={competition}
			entryFee={entryFee}
			onShare={() => {}}
		/>
	)
}
