import type { VercelConfig } from '@vercel/config/v1'

// Cron schedules used to live here. Both moved to GitHub Actions:
//   - daily-sync: .github/workflows/daily-sync.yml — GH runners fetch FPL
//     (Vercel egress is Cloudflare-403'd) and POST to /api/cron/daily-sync
//   - live-scores heartbeat: .github/workflows/live-scores.yml
export const config: VercelConfig = {
	framework: 'nextjs',
	regions: ['lhr1'],
}

export default config
