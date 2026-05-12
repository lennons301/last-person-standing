import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [react()],
	test: {
		globals: true,
		environment: 'node',
		// Don't pick up tests from local git worktrees (stale snapshots of older
		// branches). Only the primary checkout's tests are authoritative.
		// Smoke tests live in scripts/smoke and need a real Postgres — run them
		// via `just smoke` / `vitest.smoke.config.ts`, not in the default suite.
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'**/.next/**',
			'**/.worktrees/**',
			'**/*.smoke.test.ts',
		],
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
})
