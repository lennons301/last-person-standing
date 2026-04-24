'use client'
import { createContext, type ReactNode, useMemo, useState } from 'react'
import type { GoalEvent, LivePayload, PickSettlementEvent } from '@/lib/live/types'

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

interface LiveProviderProps {
	gameId: string
	children: ReactNode
}

export function LiveProvider({ gameId: _gameId, children }: LiveProviderProps) {
	const [payload] = useState<LivePayload | null>(null)
	const value = useMemo<LiveContextValue>(
		() => ({
			payload,
			events: { goals: [], settlements: [] },
			isStale: false,
			reconnecting: false,
		}),
		[payload],
	)
	return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}
