'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetPassword } from '@/lib/auth-client'

export function ResetPasswordForm() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const token = searchParams.get('token')
	const errorParam = searchParams.get('error')

	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(
		errorParam === 'invalid_token' || errorParam === 'INVALID_TOKEN'
			? 'This reset link has expired or already been used. Request a new one below.'
			: null,
	)

	if (!token) {
		return (
			<Card className="p-8 w-full max-w-md">
				<div className="text-center mb-4">
					<h1 className="font-display font-bold text-2xl">Reset link missing</h1>
				</div>
				<p className="text-sm text-muted-foreground text-center">
					This page needs a reset token. Request a fresh link below.
				</p>
				<div className="mt-6 text-center">
					<Link href="/forgot-password" className="text-sm font-semibold underline">
						Request a new link
					</Link>
				</div>
			</Card>
		)
	}

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault()
		setError(null)
		const formData = new FormData(e.currentTarget)
		const newPassword = formData.get('password') as string
		const confirm = formData.get('confirm') as string
		if (newPassword !== confirm) {
			setError("Passwords don't match.")
			return
		}
		if (!token) return
		setLoading(true)
		const result = await resetPassword({ newPassword, token })
		setLoading(false)
		if (result.error) {
			setError(result.error.message ?? 'Could not reset password. Try requesting a new link.')
			return
		}
		router.push('/auth?reset=success')
	}

	return (
		<Card className="p-8 w-full max-w-md">
			<div className="text-center mb-6">
				<h1 className="font-display font-bold text-2xl">Choose a new password</h1>
				<p className="text-sm text-muted-foreground mt-1">At least 8 characters.</p>
			</div>
			<form onSubmit={handleSubmit} className="space-y-3">
				<div>
					<Label htmlFor="password-reset">New password</Label>
					<Input
						id="password-reset"
						name="password"
						type="password"
						required
						minLength={8}
						autoComplete="new-password"
						autoFocus
					/>
				</div>
				<div>
					<Label htmlFor="confirm-reset">Confirm password</Label>
					<Input
						id="confirm-reset"
						name="confirm"
						type="password"
						required
						minLength={8}
						autoComplete="new-password"
					/>
				</div>
				{error && <p className="text-sm text-[var(--eliminated)]">{error}</p>}
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? 'Updating...' : 'Update password'}
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
