import { requireSession } from "@/lib/auth-helpers"
import { Navbar } from "@/components/features/navigation/navbar"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()

  return (
    <>
      <Navbar displayName={session.user.name ?? session.user.email} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  )
}
