'use client'
import { useContext } from 'react'
import { LiveContext, type LiveContextValue } from './live-provider'

export function useLiveGame(): LiveContextValue {
	return useContext(LiveContext)
}
