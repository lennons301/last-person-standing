'use client'

import { useEffect, useState } from 'react'

/**
 * SSR fallback timezone. The vast majority of users are UK-based, so we render
 * UK time during the initial paint. After hydration, useEffect re-formats with
 * the browser's actual timezone — UK users see no change, users abroad see a
 * brief swap to their local time.
 *
 * This avoids both the "show UTC by default because Vercel runs in UTC" bug
 * and the hydration-warning churn that comes from rendering different strings
 * on server vs client.
 */
const SSR_TIMEZONE = 'Europe/London'

const DEFAULT_OPTS: Intl.DateTimeFormatOptions = {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit',
}

interface LocalDateTimeProps {
	/** ISO string or Date. Null/undefined renders the fallback. */
	date: string | Date | null | undefined
	options?: Intl.DateTimeFormatOptions
	locale?: string
	fallback?: React.ReactNode
	className?: string
}

function toDate(date: string | Date): Date {
	return date instanceof Date ? date : new Date(date)
}

function formatWithOpts(
	date: Date,
	opts: Intl.DateTimeFormatOptions,
	locale: string,
	timeZone?: string,
): string {
	const merged = timeZone ? { ...opts, timeZone } : opts
	return new Intl.DateTimeFormat(locale, merged).format(date)
}

export function LocalDateTime({
	date,
	options,
	locale = 'en-GB',
	fallback = null,
	className,
}: LocalDateTimeProps) {
	const opts = options ?? DEFAULT_OPTS
	// Stable primitive key for the Date — treats `new Date(iso)` and the same
	// `iso` string identically, so re-renders that pass a fresh Date don't
	// retrigger the effect.
	const isoKey = date == null ? null : date instanceof Date ? date.getTime() : date
	const [browserText, setBrowserText] = useState<string | null>(null)

	useEffect(() => {
		if (isoKey == null) {
			setBrowserText(null)
			return
		}
		const d = typeof isoKey === 'number' ? new Date(isoKey) : new Date(isoKey)
		setBrowserText(formatWithOpts(d, opts, locale))
	}, [isoKey, opts, locale])

	if (date == null) return <>{fallback}</>

	const d = toDate(date)
	const ssrText = formatWithOpts(d, opts, locale, SSR_TIMEZONE)

	return (
		<span suppressHydrationWarning className={className}>
			{browserText ?? ssrText}
		</span>
	)
}

/**
 * Server-side formatter for places where a React component can't render
 * (e.g. share/OG image generation, cron logs). Always uses Europe/London —
 * the same SSR fallback the client component uses, so output is consistent
 * between server-only and client paths.
 */
export function formatLondon(
	date: string | Date,
	options: Intl.DateTimeFormatOptions = DEFAULT_OPTS,
	locale = 'en-GB',
): string {
	return formatWithOpts(toDate(date), options, locale, SSR_TIMEZONE)
}
