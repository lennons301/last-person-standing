// Legacy alias of /api/share/standings — kept for backwards compatibility with the
// deployed ShareDialog. Will be removed in 4c5.
// `runtime` must be declared directly here — Next.js can't statically resolve
// re-exported route-segment config.
export const runtime = 'nodejs'
export { GET } from '../../standings/[gameId]/route'
