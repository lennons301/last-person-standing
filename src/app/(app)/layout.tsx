import { Navbar } from '@/components/nav/navbar'
import { requireSession } from '@/lib/auth-helpers'

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	const session = await requireSession()
	return (
		<>
			<Navbar userName={session.user.name} userId={session.user.id} />
			<main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
		</>
	)
}
