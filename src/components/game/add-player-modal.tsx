'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface UserRow {
	id: string
	name: string
	email: string
}

interface AddPlayerModalProps {
	gameId: string
	onClose: () => void
}

interface AddedState {
	gamePlayerId: string
	userName: string
}

export function AddPlayerModal({ gameId, onClose }: AddPlayerModalProps) {
	const router = useRouter()
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<UserRow[]>([])
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)
	const [added, setAdded] = useState<AddedState | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	useEffect(() => {
		if (added) return
		if (query.trim().length === 0) {
			setResults([])
			return
		}
		const timer = setTimeout(async () => {
			const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
			if (!res.ok) return
			const body = (await res.json()) as { users: UserRow[] }
			setResults(body.users)
		}, 200)
		return () => clearTimeout(timer)
	}, [query, added])

	const selected = results.find((u) => u.id === selectedId) ?? null

	async function handleAdd() {
		if (!selected || submitting) return
		setSubmitting(true)
		setError(null)
		try {
			const res = await fetch(`/api/games/${gameId}/admin/add-player`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userId: selected.id }),
			})
			const body = await res.json()
			if (!res.ok) {
				setError(body.error ?? 'failed-to-add')
				return
			}
			setAdded({ gamePlayerId: body.gamePlayer.id, userName: selected.name })
		} finally {
			setSubmitting(false)
		}
	}

	function handleGoToPick() {
		if (!added) return
		router.push(`/game/${gameId}/pick?actingAs=${added.gamePlayerId}`)
	}

	function handleBackToGame() {
		onClose()
		router.refresh()
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-close; Escape handling delegated to dialog close button
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a dialog scrim, not an interactive control
		<div
			role="dialog"
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/65"
			onClick={onClose}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation on container prevents backdrop-close, not a user-facing interaction */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: inner panel is non-interactive — intercepts bubbling clicks only */}
			<div
				onClick={(e) => e.stopPropagation()}
				className="w-[340px] rounded-lg border border-border bg-background p-5 shadow-2xl"
			>
				{added ? (
					<>
						<h3 className="text-[15px] font-bold">{added.userName} added</h3>
						<p className="mb-4 mt-1 text-xs text-muted-foreground">
							Pick for them now, or come back later.
						</p>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={handleBackToGame}
								className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground"
							>
								Back to game
							</button>
							<button
								type="button"
								onClick={handleGoToPick}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
							>
								Pick for {added.userName}
							</button>
						</div>
					</>
				) : (
					<>
						<h3 className="text-[15px] font-bold">Add player to this game</h3>
						<p className="mb-3 mt-1 text-xs text-muted-foreground">
							Search an existing user by name or email.
						</p>
						<input
							ref={inputRef}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="name or email…"
							className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
						/>
						<div className="mt-2 max-h-[180px] overflow-y-auto">
							{results.map((u) => (
								<button
									type="button"
									key={u.id}
									onClick={() => setSelectedId(u.id)}
									className={cn(
										'mb-0.5 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm',
										selectedId === u.id && 'border-primary bg-primary/10',
										selectedId !== u.id && 'hover:bg-card hover:border-border',
									)}
								>
									<span className="flex-1">
										<span className="block font-semibold">{u.name}</span>
										<span className="block text-[11px] text-muted-foreground">{u.email}</span>
									</span>
								</button>
							))}
						</div>
						{error === 'already-in-game' && (
							<p className="mt-2 text-xs text-amber-600">That user is already in this game.</p>
						)}
						{error && error !== 'already-in-game' && (
							<p className="mt-2 text-xs text-red-500">Couldn't add: {error}</p>
						)}
						<p className="mt-3 rounded-l-sm border-l-2 border-primary bg-primary/10 px-2 py-2 text-[11px] text-muted-foreground">
							Can't find someone? Ask them to sign up first.
						</p>
						<div className="mt-4 flex justify-end gap-2">
							<button
								type="button"
								onClick={onClose}
								className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleAdd}
								disabled={!selected || submitting}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
							>
								{selected ? `Add ${selected.name}` : 'Add'}
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	)
}
