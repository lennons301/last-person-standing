/**
 * Gate for the fixture-driven component preview gallery (`/preview/*`).
 *
 * The gallery renders real components against hand-built fixtures with no auth
 * and no database, which makes it the review surface for UI work — and exactly
 * the sort of thing that must never be reachable on production. It's enabled
 * everywhere except a Vercel Production deployment: local dev, `pnpm build`
 * locally, and Vercel Preview deployments all get it.
 *
 * Enforced in two places, deliberately: `proxy.ts` only waives auth for
 * `/preview` when this returns true, and the routes themselves `notFound()`
 * when it returns false — so a signed-in user on production gets a 404 rather
 * than the gallery.
 */
export function previewRoutesEnabled(): boolean {
	return process.env.VERCEL_ENV !== 'production'
}
