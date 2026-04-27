'use client'
import { useState } from 'react'
import { AddPlayerModal } from './add-player-modal'
import { SplitPotModal } from './split-pot-modal'

interface AdminPanelProps {
	gameId: string
	aliveCount: number
	potTotal: string
}

export function AdminPanel({ gameId, aliveCount, potTotal }: AdminPanelProps) {
	const [openModal, setOpenModal] = useState<'add' | 'split' | null>(null)

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
				</div>
			</div>
			<AddPlayerModal
				gameId={gameId}
				open={openModal === 'add'}
				onClose={() => setOpenModal(null)}
			/>
			{openModal === 'split' && (
				<SplitPotModal
					gameId={gameId}
					aliveCount={aliveCount}
					potTotal={potTotal}
					onClose={() => setOpenModal(null)}
				/>
			)}
		</>
	)
}
