'use client'

import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface GameSwitcherProps {
	currentGameId?: string
	games: Array<{ id: string; name: string }>
}

export function GameSwitcher({ currentGameId, games }: GameSwitcherProps) {
	if (games.length === 0) return null

	const current = games.find((g) => g.id === currentGameId)
	const label = current?.name ?? 'Your games'

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors">
				{label}
				<ChevronDown className="h-3 w-3 text-muted-foreground" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{games.map((g) => (
					<DropdownMenuItem key={g.id} asChild>
						<Link href={`/game/${g.id}`}>{g.name}</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
