'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPasswordReset } from '@/lib/auth-client'

export function ForgotPasswordForm() {
	const [submitted, setSubmitted] = useState(false)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault()
		setError(null)
		setLoading(true)
		const formData = new FormData(e.currentTarget)
		const email = formData.get('email') as string

		const origin = window.location.origin
		const result = await requestPasswordReset({
			email,
			redirectTo: `${origin}/reset-password`,
		})
		setLoading(false)
		// Always show the success state, even on error. The whole point of
		// password reset UX is not to leak whether an email is in our system —
		// the API silently no-ops for unknown emails; we mirror that here.
		if (result.error) {
			console.warn('requestPasswordReset error', result.error)
		}
		setSubmitted(true)
	}

	if (submitted) {
		return (
			<Card className="p-8 w-full max-w-md">
				<div className="text-center mb-4">
					<h1 className="font-display font-bold text-2xl">Check your inbox</h1>
				</div>
				<p className="text-sm text-muted-foreground text-center">
					If an account exists for that email, we've sent a link to reset your password. The link
					expires in 1 hour.
				</p>
				<div className="mt-6 text-center">
					<Link href="/auth" className="text-sm font-semibold underline">
						Back to sign in
					</Link>
				</div>
			</Card>
		)
	}

	return (
		<Card className="p-8 w-full max-w-md">
			<div className="text-center mb-6">
				<h1 className="font-display font-bold text-2xl">Forgot password?</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Enter the email you signed up with and we'll send you a reset link.
				</p>
			</div>
			<form onSubmit={handleSubmit} className="space-y-3">
				<div>
					<Label htmlFor="email-forgot">Email</Label>
					<Input
						id="email-forgot"
						name="email"
						type="email"
						required
						autoComplete="email"
						autoFocus
					/>
				</div>
				{error && <p className="text-sm text-[var(--eliminated)]">{error}</p>}
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? 'Sending...' : 'Send reset link'}
				</Button>
			</form>
			<div className="mt-6 text-center">
				<Link
					href="/auth"
					className="text-sm text-muted-foreground hover:text-foreground underline"
				>
					Back to sign in
				</Link>
			</div>
		</Card>
	)
}
