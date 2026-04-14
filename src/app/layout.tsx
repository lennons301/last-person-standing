import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
	title: 'Last Person Standing',
	description: 'Football survivor picks game',
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	)
}
