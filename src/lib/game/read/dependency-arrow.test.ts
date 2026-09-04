import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The two rules the read-layer split rests on (#249), pinned so a later import
 * can't quietly put them back:
 *
 * 1. No `lib` module imports a type from `src/components`. A view type is
 *    declared beside the thing that builds it, and the component renders what
 *    it is handed — `detail-queries.ts` imported four of its own output types
 *    from React components, which is the arrow pointing backwards.
 * 2. Nothing types itself off a read module's implementation. Each module in
 *    `read/` declares what it returns, so a consumer names that type rather
 *    than reaching for `Awaited<ReturnType<typeof theQuery>>` — five sites did,
 *    including all three share images.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..')

function sourceFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry)
		if (statSync(full).isDirectory()) {
			out.push(...sourceFiles(full))
		} else if (/\.tsx?$/.test(entry)) {
			out.push(full)
		}
	}
	return out
}

const relative = (file: string) => path.relative(REPO_ROOT, file)

describe('the read layer owns its types', () => {
	it('no lib module imports from src/components', () => {
		const offenders = sourceFiles(path.join(REPO_ROOT, 'src/lib'))
			.filter((file) =>
				/from '@\/components|from '(\.\.\/)+components/.test(readFileSync(file, 'utf8')),
			)
			.map(relative)
		expect(offenders).toEqual([])
	})

	it('no consumer types itself off a read module', () => {
		const offenders = [
			...sourceFiles(path.join(REPO_ROOT, 'src')),
			...sourceFiles(path.join(REPO_ROOT, 'scripts')),
		]
			.filter((file) => file !== __filename)
			.filter((file) => {
				const text = readFileSync(file, 'utf8')
				return text.includes('game/read') && text.includes('Awaited<ReturnType<')
			})
			.map(relative)
		expect(offenders).toEqual([])
	})
})
