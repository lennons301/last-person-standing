/**
 * Copy for the voided-pick notice, per game mode.
 *
 * Lives in its own module (no `'use client'`) so Server Components — the
 * preview gallery — can call it too.
 *
 * See docs/superpowers/specs/2026-05-12-fixture-cancellation-handling-design.md.
 */
export function voidedPickMessage(mode: 'classic' | 'turbo' | 'cup'): string {
	switch (mode) {
		case 'classic':
			return 'A fixture you picked was cancelled. Your pick is voided — you stay alive, and the team is locked from re-use.'
		case 'turbo':
			return 'A fixture you ranked was cancelled. That rank is voided and doesn’t count towards your streak.'
		case 'cup':
			return 'A fixture you ranked was cancelled. That rank is voided — no life gained or spent.'
	}
}
