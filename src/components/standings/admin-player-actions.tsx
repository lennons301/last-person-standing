'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface AdminPlayerActionsProps {
	gameId: string
	/** gamePlayer id — the acting-as target for the "make picks" link. */
	playerId: string
	/** auth user id — required by the remove-player endpoint. Omit to hide ✕. */
	userId?: string | null
	playerName: string
}

/**
 * Row-level admin controls shared by every game mode's standings:
 *   ✎ — make picks for the player (acting-as), persists past the deadline
 *   ✕ — remove the player from the game (refund + drop from pot)
 *
 * Both only make sense for an alive player who hasn't picked the current
 * round; that gating lives at the call site (and the remove endpoint also
 * guards "player-has-picks"). Keeping the markup + remove flow in one place
 * means classic / turbo / cup can't drift out of sync.
 */
export function AdminPlayerActions({
	gameId,
	playerId,
	userId,
	playerName,
}: AdminPlayerActionsProps) {
	const router = useRouter()

	async function removePlayer() {
		if (
			!window.confirm(
				`Remove ${playerName} from the game? They haven't picked, so they'll be taken out of the standings and the pot.`,
			)
		)
			return
		const res = await fetch(`/api/games/${gameId}/admin/remove-player/${userId}`, {
			method: 'POST',
		})
		if (res.ok) {
			toast.success(`Removed ${playerName}`)
			router.refresh()
		} else {
			const body = (await res.json().catch(() => ({}))) as { error?: string }
			toast.error(
				body.error === 'player-has-picks'
					? `Can't remove ${playerName} — they've already made a pick`
					: 'Failed to remove player',
			)
		}
	}

	return (
		<>
			<a
				href={`/game/${gameId}?actingAs=${playerId}`}
				title={`Pick for ${playerName}`}
				className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:bg-muted"
			>
				✎
			</a>
			{userId && (
				<button
					type="button"
					onClick={removePlayer}
					title={`Remove ${playerName}`}
					className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-[var(--eliminated)] hover:text-[var(--eliminated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				>
					✕
				</button>
			)}
		</>
	)
}
