'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface DisclosureProps {
	title: React.ReactNode
	subtitle?: React.ReactNode
	rightSlot?: React.ReactNode
	defaultOpen?: boolean
	children: React.ReactNode
	className?: string
	/**
	 * Style the disclosure as a section card with border + rounded
	 * corners. Default true; pass false when the parent already
	 * provides chrome.
	 */
	bordered?: boolean
}

/**
 * Lightweight client-side collapsible. Keyboard-accessible (the toggle
 * is a real button), uses an animated chevron, retains state across
 * renders without a router round-trip. Sections in the cup pick
 * interface + standings panels wrap with this so a long page can be
 * folded down to what the viewer wants to see.
 */
export function Disclosure({
	title,
	subtitle,
	rightSlot,
	defaultOpen = true,
	children,
	className,
	bordered = true,
}: DisclosureProps) {
	const [open, setOpen] = useState(defaultOpen)
	return (
		<div
			className={cn(
				bordered && 'rounded-lg border border-border bg-card overflow-hidden',
				className,
			)}
		>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className={cn(
					'flex w-full items-center justify-between gap-3 text-left',
					bordered ? 'px-4 py-3' : 'py-2',
					'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
				)}
			>
				<div className="min-w-0 flex-1">
					<div className="text-sm font-semibold leading-tight">{title}</div>
					{subtitle && (
						<div className="text-xs text-muted-foreground mt-0.5 leading-tight">{subtitle}</div>
					)}
				</div>
				<div className="flex items-center gap-2 shrink-0">
					{rightSlot}
					<ChevronDown
						className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
						aria-hidden
					/>
				</div>
			</button>
			{open && <div className={cn(bordered && 'border-t border-border')}>{children}</div>}
		</div>
	)
}
