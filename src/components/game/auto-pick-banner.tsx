'use client'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'dismissedAutoPicks'

interface AutoPickBannerProps {
	pickId: string
	teamShortName: string
	kickoffLabel: string
}

function getDismissed(): string[] {
	if (typeof window === 'undefined') return []
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		return raw ? (JSON.parse(raw) as string[]) : []
	} catch {
		return []
	}
}

function persistDismissed(ids: string[]) {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

export function AutoPickBanner({ pickId, teamShortName, kickoffLabel }: AutoPickBannerProps) {
	const [dismissed, setDismissed] = useState(false)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
		if (getDismissed().includes(pickId)) {
			setDismissed(true)
		}
	}, [pickId])

	if (!mounted || dismissed) return null

	function handleDismiss() {
		const ids = getDismissed()
		if (!ids.includes(pickId)) {
			ids.push(pickId)
			persistDismissed(ids)
		}
		setDismissed(true)
	}

	return (
		<div className="mx-4 my-3 flex items-start gap-3 rounded-lg border border-amber-500/50 bg-card p-3">
			<span className="text-lg text-amber-500">⚠</span>
			<div className="flex-1">
				<h4 className="text-xs font-bold">You missed the deadline</h4>
				<p className="mt-0.5 text-[11px] text-muted-foreground">
					We auto-picked {teamShortName} for you — the lowest-ranked team you hadn't used. Kickoff
					is {kickoffLabel}. Message the admin if you want to swap.
				</p>
			</div>
			<button
				type="button"
				onClick={handleDismiss}
				className="text-sm text-muted-foreground"
				aria-label="Dismiss"
			>
				✕
			</button>
		</div>
	)
}
