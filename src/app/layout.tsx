import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { fontDisplay, fontSans } from '@/lib/fonts'
import './globals.css'

export const metadata: Metadata = {
	title: 'Last Person Standing',
	description: 'Football survivor picks game',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${fontSans.variable} ${fontDisplay.variable}`}
		>
			<body>
				<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
					{children}
				</ThemeProvider>
			</body>
		</html>
	)
}
