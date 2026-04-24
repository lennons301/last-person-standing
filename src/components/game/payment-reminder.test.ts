import { describe, expect, it } from 'vitest'
import { buildReminderUrl } from './payment-reminder'

describe('buildReminderUrl', () => {
	it('encodes the reminder text into a wa.me URL', () => {
		const url = buildReminderUrl({
			gameName: 'The Lads LPS',
			amount: '10.00',
			creatorName: 'Dave',
			inviteCode: 'ABC123',
			origin: 'https://lps.example.com',
		})
		expect(url).toContain('https://wa.me/?text=')
		const decoded = decodeURIComponent(url.split('text=')[1])
		expect(decoded).toContain('£10.00')
		expect(decoded).toContain('The Lads LPS')
		expect(decoded).toContain('https://lps.example.com/join/ABC123')
	})
})
