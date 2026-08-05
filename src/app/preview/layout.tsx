import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PreviewThemeToggle } from '@/app/preview/theme-toggle'
import { previewRoutesEnabled } from '@/lib/preview'

export const metadata = { title: 'LPS component previews' }

/**
 * Fixture-driven component gallery: no auth, no database, no live game. The
 * primary review surface for the game-page hierarchy redesign.
 *
 * Gated to non-production (see `previewRoutesEnabled`) in both the proxy and
 * here, so production returns 404 even for a signed-in user.
 */
export default function PreviewLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	if (!previewRoutesEnabled()) notFound()

	return (
		<main className="max-w-4xl mx-auto px-4 py-6">
			<div className="flex items-center justify-between gap-4 mb-6">
				<div>
					<Link href="/preview" className="font-display text-lg font-semibold hover:underline">
						Component previews
					</Link>
					<p className="text-xs text-muted-foreground mt-0.5">
						Fixture-driven, non-production only. No auth, no database.
					</p>
				</div>
				<PreviewThemeToggle />
			</div>
			{children}
		</main>
	)
}
