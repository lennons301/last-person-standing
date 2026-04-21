import type { VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
	framework: 'nextjs',
	crons: [{ path: '/api/cron/daily-sync', schedule: '0 4 * * *' }],
}

export default config
