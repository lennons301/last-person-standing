/**
 * "Pay {creator} £{amount}" — the creator's pre-filled Monzo/Revolut link.
 *
 * Purely presentational, and deliberately dumb: the href is derived server-side
 * by `buildPaymentLink` and arrives as a plain string. A null `url` means the
 * creator saved no handle, so the caller renders its manual fallback instead —
 * this component simply doesn't render.
 *
 * Tapping it does not record anything. The player still presses "I've paid"
 * afterwards; the app points at money, it never sees it.
 */
export function PayLinkButton({
	url,
	creatorName,
	amount,
	className,
}: {
	url: string | null
	creatorName: string
	amount: string
	className?: string
}) {
	if (!url) return null
	return (
		<a
			href={url}
			target="_blank"
			rel="noreferrer"
			className={
				className ??
				'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
			}
		>
			Pay {creatorName} £{amount}
		</a>
	)
}
