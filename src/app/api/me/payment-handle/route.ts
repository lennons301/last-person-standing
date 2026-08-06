import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { parsePaymentHandleInput } from '@/lib/payments/payment-link'
import { user } from '@/lib/schema/auth'

/**
 * Set or clear the caller's own payment handle — where players pay them when
 * they run a game.
 *
 * Owner-only by construction: the row is chosen by the session's user id, and
 * the body carries no user reference at all. Nobody can redirect someone else's
 * pot, because there's no parameter through which to try.
 *
 * Changing a handle only affects links rendered from now on. Settled payments
 * are historical rows and are never touched here.
 */
export async function POST(request: Request): Promise<Response> {
	const session = await requireSession()

	const body = (await request.json().catch(() => null)) as {
		provider?: unknown
		handle?: unknown
	} | null

	const update = parsePaymentHandleInput(body?.provider, body?.handle)
	if (!update) {
		return NextResponse.json(
			{
				error: 'invalid-payment-handle',
				message:
					'Enter your Monzo or Revolut username (just the username, e.g. alicejones) and pick which one it is.',
			},
			{ status: 400 },
		)
	}

	await db.update(user).set(update).where(eq(user.id, session.user.id))

	return NextResponse.json({ provider: update.paymentProvider, handle: update.paymentHandle })
}
