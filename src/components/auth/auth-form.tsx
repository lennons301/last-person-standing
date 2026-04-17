'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { authClient } from '@/lib/auth-client'

export function AuthForm() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const callbackUrl = searchParams.get('callbackUrl') || '/'

	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)

	async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault()
		setError(null)
		setLoading(true)
		const formData = new FormData(e.currentTarget)
		const email = formData.get('email') as string
		const password = formData.get('password') as string

		const result = await authClient.signIn.email({ email, password })
		setLoading(false)
		if (result.error) {
			setError(result.error.message ?? 'Sign in failed')
			return
		}
		router.push(callbackUrl)
	}

	async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault()
		setError(null)
		setLoading(true)
		const formData = new FormData(e.currentTarget)
		const name = formData.get('name') as string
		const email = formData.get('email') as string
		const password = formData.get('password') as string

		const result = await authClient.signUp.email({ name, email, password })
		setLoading(false)
		if (result.error) {
			setError(result.error.message ?? 'Sign up failed')
			return
		}
		router.push(callbackUrl)
	}

	return (
		<Card className="p-8 w-full max-w-md">
			<div className="text-center mb-6">
				<h1 className="font-display font-bold text-2xl">Last Person Standing</h1>
				<p className="text-sm text-muted-foreground mt-1">Football survivor picks</p>
			</div>

			<Tabs defaultValue="signin" className="w-full" onValueChange={() => setError(null)}>
				<TabsList className="grid w-full grid-cols-2 mb-4">
					<TabsTrigger value="signin">Sign in</TabsTrigger>
					<TabsTrigger value="signup">Create account</TabsTrigger>
				</TabsList>

				<TabsContent value="signin">
					<form onSubmit={handleSignIn} className="space-y-3">
						<div>
							<Label htmlFor="email-signin">Email</Label>
							<Input id="email-signin" name="email" type="email" required autoComplete="email" />
						</div>
						<div>
							<Label htmlFor="password-signin">Password</Label>
							<Input
								id="password-signin"
								name="password"
								type="password"
								required
								autoComplete="current-password"
							/>
						</div>
						{error && <p className="text-sm text-[var(--eliminated)]">{error}</p>}
						<Button type="submit" className="w-full" disabled={loading}>
							{loading ? 'Signing in...' : 'Sign in'}
						</Button>
					</form>
				</TabsContent>

				<TabsContent value="signup">
					<form onSubmit={handleSignUp} className="space-y-3">
						<div>
							<Label htmlFor="name-signup">Name</Label>
							<Input id="name-signup" name="name" type="text" required autoComplete="name" />
						</div>
						<div>
							<Label htmlFor="email-signup">Email</Label>
							<Input id="email-signup" name="email" type="email" required autoComplete="email" />
						</div>
						<div>
							<Label htmlFor="password-signup">Password</Label>
							<Input
								id="password-signup"
								name="password"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
							/>
						</div>
						{error && <p className="text-sm text-[var(--eliminated)]">{error}</p>}
						<Button type="submit" className="w-full" disabled={loading}>
							{loading ? 'Creating account...' : 'Create account'}
						</Button>
					</form>
				</TabsContent>
			</Tabs>
		</Card>
	)
}
