import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: 'resources.premierleague.com' },
			{ protocol: 'https', hostname: 'crests.football-data.org' },
		],
	},
}

export default nextConfig
