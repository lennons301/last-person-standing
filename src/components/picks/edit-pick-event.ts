'use client'

import { useEffect, useRef } from 'react'

/**
 * "Open the pick editor" signal, fired by the game hero and handled by whichever
 * pick interface is mounted below it.
 *
 * The hero is rendered by GameDetailView while the pick interface is built on
 * the server and handed down as an opaque `pickSection` node, so there's no prop
 * or context path between them. A window event keeps the coupling to one line on
 * each side: the hero's "Change pick" button reveals the classic picker in a
 * single click instead of anchoring to a collapsed card the user then has to
 * expand themselves.
 */
export const EDIT_PICK_EVENT = 'lps:edit-pick'

export function requestPickEdit() {
	if (typeof window === 'undefined') return
	window.dispatchEvent(new Event(EDIT_PICK_EVENT))
}

export function useOnPickEditRequest(handler: () => void) {
	// Keep the latest handler in a ref so the listener is attached once, not on
	// every render (the callers pass inline closures).
	const ref = useRef(handler)
	ref.current = handler

	useEffect(() => {
		const listener = () => ref.current()
		window.addEventListener(EDIT_PICK_EVENT, listener)
		return () => window.removeEventListener(EDIT_PICK_EVENT, listener)
	}, [])
}
