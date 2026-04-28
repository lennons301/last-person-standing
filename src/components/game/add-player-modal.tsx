'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface UserRow {
	id: string
	name: string
	email: string
	isInGame?: boolean
}

interface AddPlayerModalProps {
	gameId: string
	open: boolean
	onClose: () => void
}

interface AddedState {
	gamePlayerId: string
	userName: string
}

export function AddPlayerModal({ gameId, open, onClose }: AddPlayerModalProps) {
	const router = useRouter()
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<UserRow[]>([])
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)
	const [added, setAdded] = useState<AddedState | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	// Reset state when dialog opens
	useEffect(() => {
		if (open) {
			setQuery('')
			setResults([])
			setSelectedId(null)
			setError(null)
			setAdded(null)
		}
	}, [open])

	useEffect(() => {
		if (added) return
		if (query.trim().length === 0) {
			setResults([])
			return
		}
		const timer = setTimeout(async () => {
			const params = new URLSearchParams({
				q: query,
				gameId: gameId,
			})
			const res = await fetch(`/api/users/search?${params}`)
			if (!res.ok) return
			const body = (await res.json()) as { users: UserRow[] }
			setResults(body.users)
		}, 200)
		return () => clearTimeout(timer)
	}, [query, added, gameId])

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
		onClose()
		router.push(`/game/${gameId}?actingAs=${added.gamePlayerId}`)
	}

	function handleBackToGame() {
		onClose()
		router.refresh()
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-md">
				{added ? (
					<>
						<DialogHeader>
							<DialogTitle>{added.userName} added</DialogTitle>
							<DialogDescription>Pick for them now, or come back later.</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<button
								type="button"
								onClick={handleBackToGame}
								className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							>
								Back to game
							</button>
							<button
								type="button"
								onClick={handleGoToPick}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							>
								Pick for {added.userName}
							</button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Add player to this game</DialogTitle>
							<DialogDescription>Search an existing user by name or email.</DialogDescription>
						</DialogHeader>
						<div className="space-y-3">
							<input
								ref={inputRef}
								autoFocus
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="name or email…"
								className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
							/>
							<div className="max-h-[180px] overflow-y-auto">
								{results.map((u) => (
									<button
										type="button"
										key={u.id}
										onClick={() => setSelectedId(u.id)}
										className={cn(
											'mb-0.5 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
											selectedId === u.id && 'border-primary bg-primary/10',
											selectedId !== u.id && 'hover:bg-card hover:border-border',
										)}
									>
										<span className="flex-1">
											<span className="block font-semibold">{u.name}</span>
											<span className="block text-[11px] text-muted-foreground">{u.email}</span>
										</span>
										{u.isInGame && (
											<span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
												IN GAME
											</span>
										)}
									</button>
								))}
							</div>
							{error === 'already-in-game' && (
								<p className="text-xs text-amber-600">That user is already in this game.</p>
							)}
							{error && error !== 'already-in-game' && (
								<p className="text-xs text-red-500">Couldn't add: {error}</p>
							)}
							<p className="rounded-l-sm border-l-2 border-primary bg-primary/10 px-2 py-2 text-[11px] text-muted-foreground">
								Can't find someone? Ask them to sign up first.
							</p>
						</div>
						<DialogFooter>
							<button
								type="button"
								onClick={onClose}
								className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleAdd}
								disabled={!selected || submitting}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							>
								{selected ? `Add ${selected.name}` : 'Add'}
							</button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
