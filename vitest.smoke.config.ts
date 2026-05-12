import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Smoke-test runner. Real Postgres (DATABASE_URL from env). One scenario
 * per supported (game-mode × competition) combo plus the live-projection
 * exercises. Tests reset the DB themselves, but serialise to avoid
 * cross-test interference.
 */
export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['scripts/smoke/**/*.smoke.test.ts'],
		fileParallelism: false,
		sequence: { concurrent: false },
		testTimeout: 30_000,
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
})
