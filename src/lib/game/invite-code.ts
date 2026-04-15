const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInviteCode(length = 8): string {
	const bytes = new Uint8Array(length)
	crypto.getRandomValues(bytes)
	return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('')
}
