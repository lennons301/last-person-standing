'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

/** Light/dark flip for the gallery — every variant needs reviewing in both. */
export function PreviewThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme()
	return (
		<Button
			variant="outline"
			size="sm"
			onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
		>
			{resolvedTheme === 'dark' ? 'Light' : 'Dark'} mode
		</Button>
	)
}
