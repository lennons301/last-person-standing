interface PaymentReminderProps {
	gameName: string
	amount: string
	creatorName: string
	inviteCode: string
	origin?: string
}

export function buildReminderUrl(p: PaymentReminderProps): string {
	const base = p.origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
	const inviteUrl = `${base}/join/${p.inviteCode}`
	const text = `Hi! Reminder: you owe £${p.amount} for ${p.gameName}. When you've paid, hit "Mark as paid" in the app: ${inviteUrl}`
	return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function PaymentReminderButton(p: PaymentReminderProps) {
	return (
		<a
			href={buildReminderUrl(p)}
			target="_blank"
			rel="noreferrer"
			className="inline-flex items-center gap-1 rounded bg-[#25d366] px-3 py-1.5 text-xs font-semibold text-white"
		>
			💬 Remind via WhatsApp
		</a>
	)
}
