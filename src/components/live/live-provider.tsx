'use client'
import { createContext, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { detectGoalDeltas, detectPickSettlements } from '@/lib/live/detect'
import type { GoalEvent, LivePayload, PickSettlementEvent } from '@/lib/live/types'

const LIVE_CADENCE_MS = 30_000
const IDLE_CADENCE_MS = 5 * 60_000
const MAX_BACKOFF_MS = 120_000
const LIVE_WINDOW_BEFORE_MS = 10 * 60_000
const LIVE_WINDOW_AFTER_MS = 150 * 60_000
const EVENT_BUFFER_CAP = 20

export interface LiveContextValue {
	payload: LivePayload | null
	events: {
		goals: GoalEvent[]
		settlements: PickSettlementEvent[]
	}
	isStale: boolean
	reconnecting: boolean
}

const defaultValue: LiveContextValue = {
	payload: null,
	events: { goals: [], settlements: [] },
	isStale: false,
	reconnecting: false,
}

export const LiveContext = createContext<LiveContextValue>(defaultValue)

function hasActiveFixture(payload: LivePayload | null, now = Date.now()): boolean {
	if (!payload) return false
	return payload.fixtures.some((f) => {
		if (!f.kickoff) return false
		const t = typeof f.kickoff === 'string' ? Date.parse(f.kickoff) : f.kickoff.getTime()
		return now >= t - LIVE_WINDOW_BEFORE_MS && now <= t + LIVE_WINDOW_AFTER_MS
	})
}

interface LiveProviderProps {
	gameId: string
	children: ReactNode
}

export function LiveProvider({ gameId, children }: LiveProviderProps) {
	const [payload, setPayload] = useState<LivePayload | null>(null)
	const [goals, setGoals] = useState<GoalEvent[]>([])
	const [settlements, setSettlements] = useState<PickSettlementEvent[]>([])
	const [isStale, setIsStale] = useState(false)
	const [reconnecting, setReconnecting] = useState(false)

	const previousRef = useRef<LivePayload | null>(null)
	const backoffRef = useRef(0)

	useEffect(() => {
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | null = null

		async function fetchOnce() {
			let scheduleNext = true
			try {
				const res = await fetch(`/api/games/${gameId}/live`, { cache: 'no-store' })
				if (cancelled) {
					scheduleNext = false
					return
				}
				if (res.status === 401 || res.status === 403 || res.status === 404) {
					setPayload(null)
					setIsStale(true)
					setReconnecting(false)
					return
				}
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				const next = (await res.json()) as LivePayload
				const prev = previousRef.current
				if (prev) {
					const newGoals = detectGoalDeltas(prev, next)
					if (newGoals.length) {
						setGoals((g) => [...g, ...newGoals].slice(-EVENT_BUFFER_CAP))
					}
					const newSettlements = detectPickSettlements(prev, next)
					if (newSettlements.length) {
						setSettlements((s) => [...s, ...newSettlements].slice(-EVENT_BUFFER_CAP))
					}
				}
				previousRef.current = next
				setPayload(next)
				setIsStale(false)
				setReconnecting(false)
				backoffRef.current = 0
			} catch {
				if (cancelled) {
					scheduleNext = false
					return
				}
				setIsStale(true)
				setReconnecting(true)
				backoffRef.current = Math.min(
					backoffRef.current > 0 ? backoffRef.current * 2 : LIVE_CADENCE_MS,
					MAX_BACKOFF_MS,
				)
			}

			if (!scheduleNext) return
			if (cancelled) return
			if (document.visibilityState === 'hidden') return
			const interval =
				backoffRef.current > 0
					? backoffRef.current
					: hasActiveFixture(previousRef.current)
						? LIVE_CADENCE_MS
						: IDLE_CADENCE_MS
			timer = setTimeout(fetchOnce, interval)
		}

		function handleVisibility() {
			if (document.visibilityState === 'visible') {
				if (timer) clearTimeout(timer)
				void fetchOnce()
			} else if (timer) {
				clearTimeout(timer)
				timer = null
			}
		}

		document.addEventListener('visibilitychange', handleVisibility)
		void fetchOnce()

		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
			document.removeEventListener('visibilitychange', handleVisibility)
			previousRef.current = null
		}
	}, [gameId])

	const value = useMemo<LiveContextValue>(
		() => ({ payload, events: { goals, settlements }, isStale, reconnecting }),
		[payload, goals, settlements, isStale, reconnecting],
	)

	return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}
