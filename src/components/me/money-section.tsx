'use client'

import { MoneyPanel } from '@/components/me/money-panel'
import { Disclosure } from '@/components/ui/disclosure'
import type { MoneySummary } from '@/lib/game/me-summary-view'

/**
 * The Money section: a heading a player can find, and a fold they have to open.
 *
 * Collapsed rather than blurred, and remembering nothing between visits — most
 * players are down on this hobby, and the number should be one they ask for
 * rather than one the page puts in front of them on load. The fold state lives
 * here in `Disclosure` (client, `useState`, no storage), and everything it hides
 * lives in `MoneyPanel`, which knows nothing about being hidden.
 *
 * The headline and the per-game breakdown are inside the *same* fold on purpose:
 * an open headline sitting beside a separately-visible list of losses would give
 * the number away to a player who never asked for it.
 */
export function MoneySection({ money }: { money: MoneySummary }) {
	return (
		<section aria-labelledby="money" className="space-y-3">
			<div>
				<h2 id="money" className="font-display text-lg font-semibold">
					Money
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					What this has cost you, and what it has paid you back. Stakes are counted the way every
					game page counts its pot, so the two reconcile.
				</p>
			</div>
			<Disclosure
				title="Profit and loss"
				subtitle="Hidden until you ask — open it when you want to know"
				defaultOpen={false}
			>
				<MoneyPanel money={money} />
			</Disclosure>
		</section>
	)
}
