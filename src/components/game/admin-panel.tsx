'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AddPlayerModal } from './add-player-modal'
import { SplitPotModal } from './split-pot-modal'

interface AdminPanelProps {
	gameId: string
	gameName: string
	aliveCount: number
	potTotal: string
}

export function AdminPanel({ gameId, gameName, aliveCount, potTotal }: AdminPanelProps) {
	const [openModal, setOpenModal] = useState<'add' | 'split' | null>(null)
	const [deleteError, setDeleteError] = useState<string | null>(null)
	const [isPending, startTransition] = useTransition()
	const router = useRouter()

	function handleDelete() {
		const ok = window.confirm(
			`Delete "${gameName}"? This permanently removes the game and every pick, payment, and player record attached to it. Cannot be undone.`,
		)
		if (!ok) return
		setDeleteError(null)
		startTransition(async () => {
			const res = await fetch(`/api/games/${gameId}`, { method: 'DELETE' })
			if (!res.ok) {
				const body = await res.json().catch(() => ({}))
				setDeleteError(body.message ?? body.error ?? 'Delete failed')
				return
			}
			router.push('/dashboard')
			router.refresh()
		})
	}

	return (
		<>
			<div className="rounded-xl border border-border bg-card p-4">
				<div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
					<span className="rounded-sm bg-primary px-1.5 py-0.5 text-[9px] text-primary-foreground">
						Admin
					</span>
					Game actions
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() => setOpenModal('add')}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
					>
						+ Add player
					</button>
					<button
						type="button"
						onClick={() => setOpenModal('split')}
						disabled={aliveCount < 2}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
					>
						Split pot ({aliveCount} alive)
					</button>
					<button
						type="button"
						onClick={handleDelete}
						disabled={isPending}
						className="ml-auto rounded-md border border-[color-mix(in_oklab,var(--eliminated)_60%,transparent)] bg-background px-3 py-1.5 text-xs font-semibold text-[var(--eliminated)] hover:bg-[color-mix(in_oklab,var(--eliminated)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isPending ? 'Deleting…' : 'Delete game'}
					</button>
				</div>
				{deleteError && <p className="mt-2 text-xs text-[var(--eliminated)]">{deleteError}</p>}
			</div>
			<AddPlayerModal
				gameId={gameId}
				open={openModal === 'add'}
				onClose={() => setOpenModal(null)}
			/>
			<SplitPotModal
				gameId={gameId}
				aliveCount={aliveCount}
				potTotal={potTotal}
				open={openModal === 'split'}
				onClose={() => setOpenModal(null)}
			/>
		</>
	)
}
