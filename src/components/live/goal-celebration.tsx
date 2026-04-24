'use client'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { LivePick } from '@/lib/live/types'
import { cn } from '@/lib/utils'
import { useLiveGame } from './use-live-game'

interface GoalCelebrationProps {
	fixtureId: string
	viewerPick?: LivePick | null
	children: ReactNode
}

interface Celebration {
	eventId: string
	side: 'home' | 'away'
	minute: number
	friendly: boolean
}

const HOLD_MS = 2000

export function GoalCelebration({ fixtureId, viewerPick, children }: GoalCelebrationProps) {
	const { events } = useLiveGame()
	const [active, setActive] = useState<Celebration | null>(null)
	const handledIds = useRef<Set<string>>(new Set())

	useEffect(() => {
		const newForThisFixture = events.goals.filter(
			(ev) => ev.fixtureId === fixtureId && !handledIds.current.has(ev.id),
		)
		if (newForThisFixture.length === 0) return
		for (const ev of newForThisFixture) handledIds.current.add(ev.id)
		const latest = newForThisFixture[newForThisFixture.length - 1]
		const friendly =
			!!viewerPick &&
			((latest.side === 'home' && viewerPick.predictedResult === 'home_win') ||
				(latest.side === 'away' && viewerPick.predictedResult === 'away_win'))
		setActive({ eventId: latest.id, side: latest.side, minute: 0, friendly })
		const timer = setTimeout(() => {
			setActive((current) => (current?.eventId === latest.id ? null : current))
		}, HOLD_MS)
		return () => clearTimeout(timer)
	}, [events.goals, fixtureId, viewerPick])

	return (
		<div className="relative">
			{active && (
				<span
					className={cn(
						'absolute left-1/2 -top-2.5 z-10 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg',
						active.friendly ? 'bg-emerald-500' : 'bg-red-500',
					)}
				>
					GOAL
				</span>
			)}
			<div
				data-celebrating={active ? (active.friendly ? 'friendly' : 'opposing') : undefined}
				className={cn(
					'transition-all duration-300',
					active?.friendly &&
						'ring-2 ring-emerald-500 shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-[1.03]',
					active &&
						!active.friendly &&
						'ring-2 ring-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] scale-[1.02]',
				)}
			>
				{children}
			</div>
		</div>
	)
}
