'use client'

import { Moon, Sun } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { authClient } from '@/lib/auth-client'

interface UserMenuProps {
	name: string
}

export function UserMenu({ name }: UserMenuProps) {
	const router = useRouter()
	const { theme, setTheme } = useTheme()
	const initials = name
		.split(' ')
		.map((p) => p[0])
		.join('')
		.slice(0, 2)
		.toUpperCase()

	async function handleSignOut() {
		await authClient.signOut()
		router.push('/auth')
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" className="rounded-full h-9 w-9 p-0">
					<Avatar className="h-9 w-9">
						<AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs font-bold">
							{initials}
						</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
					{theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
					Toggle theme
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
