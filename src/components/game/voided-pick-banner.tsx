'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLiveGame } from '@/components/live/use-live-game'

/**
 * Notifies the viewer when one of their picks has been voided (fixture
 * cancelled or whole round voided). Per the cancellation design:
 * dismissible per-pick void banner; round-voided banner is also
 * dismissible but more visually prominent.
 *
 * Renders nothing if the viewer has no voided picks on the current or
 * most recent round. Dismissal is persisted in localStorage keyed by
 * (gameId + pickId) so the banner doesn't reappear on every poll.
 *
 * See docs/superpowers/specs/2026-05-12-fixture-cancellation-handling-design.md.
 */
export function VoidedPickBanner({
	gameId,
	gameMode,
}: {
	gameId: string
	gameMode: 'classic' | 'turbo' | 'cup'
}) {
	const { payload } = useLiveGame()
	const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set())

	useEffect(() => {
		// Hydrate dismissals from localStorage once.
		try {
			const raw = window.localStorage.getItem(`voided-banner-dismiss:${gameId}`)
			if (raw) setDismissedKeys(new Set(JSON.parse(raw) as string[]))
		} catch {
			// localStorage unavailable — fall through; banner re-shows on
			// every visit, no harm done.
		}
	}, [gameId])

	if (!payload) return null
	const viewerUserId = payload.viewerUserId
	const viewerGp = payload.players.find((p) => p.userId === viewerUserId)
	if (!viewerGp) return null

	const voidedPicks = payload.picks.filter(
		(p) => p.gamePlayerId === viewerGp.id && p.result === 'void',
	)
	if (voidedPicks.length === 0) return null

	const visiblePicks = voidedPicks.filter((p) => !dismissedKeys.has(pickKey(p.fixtureId)))
	if (visiblePicks.length === 0) return null

	function dismiss(fixtureId: string | null) {
		const key = pickKey(fixtureId)
		const next = new Set(dismissedKeys)
		next.add(key)
		setDismissedKeys(next)
		try {
			window.localStorage.setItem(`voided-banner-dismiss:${gameId}`, JSON.stringify([...next]))
		} catch {
			// noop
		}
	}

	return (
		<div className="mb-4 space-y-2">
			{visiblePicks.map((p) => (
				<div
					key={pickKey(p.fixtureId)}
					className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm dark:border-sky-800/50 dark:bg-sky-900/30"
				>
					<div className="flex-1">
						<p className="font-semibold text-sky-900 dark:text-sky-100">Pick voided</p>
						<p className="mt-0.5 text-sky-800 dark:text-sky-200">
							{messageFor(gameMode, p.fixtureId)}
						</p>
					</div>
					<button
						type="button"
						aria-label="Dismiss"
						onClick={() => dismiss(p.fixtureId)}
						className="text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
			))}
		</div>
	)
}

function pickKey(fixtureId: string | null): string {
	return fixtureId ?? 'unknown'
}

function messageFor(mode: 'classic' | 'turbo' | 'cup', _fixtureId: string | null): string {
	switch (mode) {
		case 'classic':
			return 'A fixture you picked was cancelled. Your pick is voided — you stay alive, and the team is locked from re-use.'
		case 'turbo':
			return 'A fixture you ranked was cancelled. That rank is voided and doesn’t count towards your streak.'
		case 'cup':
			return 'A fixture you ranked was cancelled. That rank is voided — no life gained or spent.'
	}
}
