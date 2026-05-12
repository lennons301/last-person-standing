import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Smoke-test runner. Hits a real Postgres (DATABASE_URL from env), one
 * scenario per supported game mode × competition combo. Each test resets
 * the DB so they're isolated, but they also serialise (no parallelism) so
 * they don't fight over the same tables.
 */
export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['scripts/smoke/**/*.smoke.test.ts'],
		// Real DB — must serialise.
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
