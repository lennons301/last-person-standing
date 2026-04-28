'use client'

import { Minus, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface CreateGameFormProps {
	competitions: Array<{ id: string; name: string }>
}

type GameMode = 'classic' | 'turbo' | 'cup'

const MODE_DESCRIPTIONS: Record<GameMode, string> = {
	classic: 'One pick per round. Win to survive. Last person standing.',
	turbo: 'Predict 10 fixtures ranked by confidence. Highest streak wins.',
	cup: 'Predict cup fixtures. Lives system with tier handicaps.',
}

export function CreateGameForm({ competitions }: CreateGameFormProps) {
	const router = useRouter()
	const [name, setName] = useState('')
	const [competitionId, setCompetitionId] = useState('')
	const [mode, setMode] = useState<GameMode | null>(null)
	const [hasEntryFee, setHasEntryFee] = useState(true)
	const [entryFee, setEntryFee] = useState(10)
	const [startingLives, setStartingLives] = useState(0)
	const [numberOfPicks, setNumberOfPicks] = useState(10)
	const [allowRebuys, setAllowRebuys] = useState(false)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const step1Done = name.trim().length > 0
	const step2Done = step1Done && competitionId
	const step3Done = step2Done && mode
	const canSubmit = step3Done && !loading

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault()
		if (!canSubmit) return
		setLoading(true)
		setError(null)

		const modeConfig: {
			numberOfPicks?: number
			startingLives?: number
			allowRebuys?: boolean
		} = {}
		if (mode === 'turbo' || mode === 'cup') modeConfig.numberOfPicks = numberOfPicks
		if (mode === 'cup') modeConfig.startingLives = startingLives
		if (mode === 'classic') modeConfig.allowRebuys = allowRebuys

		const res = await fetch('/api/games', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name,
				competitionId,
				gameMode: mode,
				modeConfig,
				entryFee: hasEntryFee ? entryFee.toFixed(2) : null,
			}),
		})
		setLoading(false)
		if (!res.ok) {
			const body = await res.json().catch(() => ({ error: 'Failed to create' }))
			setError(body.error ?? 'Failed to create game')
			return
		}
		const created = await res.json()
		router.push(`/game/${created.id}`)
	}

	return (
		<Card className="p-6 max-w-xl mx-auto">
			<h1 className="font-display text-2xl font-semibold mb-6">Create a game</h1>
			<form onSubmit={handleSubmit} className="space-y-6">
				<div>
					<Label htmlFor="name">Game name</Label>
					<Input
						id="name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="e.g. The Lads LPS"
						required
					/>
				</div>

				{step1Done && (
					<div>
						<Label htmlFor="competition">Competition</Label>
						<Select value={competitionId} onValueChange={setCompetitionId}>
							<SelectTrigger id="competition">
								<SelectValue placeholder="Choose a competition" />
							</SelectTrigger>
							<SelectContent>
								{competitions.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{c.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{step2Done && (
					<div>
						<Label>Game mode</Label>
						<div className="grid gap-2 mt-2">
							{(['classic', 'turbo', 'cup'] as const).map((m) => (
								<button
									key={m}
									type="button"
									onClick={() => setMode(m)}
									className={cn(
										'text-left p-3 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
										mode === m
											? 'border-[var(--alive)] bg-[var(--alive-bg)]'
											: 'border-border hover:border-muted-foreground bg-card',
									)}
								>
									<div className="font-display font-semibold capitalize">{m}</div>
									<div className="text-xs text-muted-foreground mt-0.5">{MODE_DESCRIPTIONS[m]}</div>
								</button>
							))}
						</div>
					</div>
				)}

				{step3Done && (
					<>
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<Label htmlFor="entry-fee-toggle">Entry fee</Label>
								<Switch
									id="entry-fee-toggle"
									checked={hasEntryFee}
									onCheckedChange={setHasEntryFee}
								/>
							</div>
							{hasEntryFee && (
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="icon"
										onClick={() => setEntryFee(Math.max(10, entryFee - 10))}
										disabled={entryFee <= 10}
									>
										<Minus className="h-4 w-4" />
									</Button>
									<div className="font-display font-semibold text-lg min-w-[4rem] text-center">
										£{entryFee}
									</div>
									<Button
										type="button"
										variant="outline"
										size="icon"
										onClick={() => setEntryFee(entryFee + 10)}
									>
										<Plus className="h-4 w-4" />
									</Button>
									<span className="text-xs text-muted-foreground ml-2">Steps of £10</span>
								</div>
							)}
						</div>

						{mode === 'classic' && (
							<div className="flex items-start justify-between gap-3">
								<div>
									<Label htmlFor="allow-rebuys-toggle">Allow paid rebuys</Label>
									<p className="text-xs text-muted-foreground mt-0.5">
										If on, round 1 losses eliminate players — and they can pay again to re-enter for
										round 2.
									</p>
								</div>
								<Switch
									id="allow-rebuys-toggle"
									checked={allowRebuys}
									onCheckedChange={setAllowRebuys}
								/>
							</div>
						)}

						{mode === 'cup' && (
							<div className="flex items-center gap-2">
								<Label htmlFor="lives">Starting lives</Label>
								<Input
									id="lives"
									type="number"
									min={0}
									max={10}
									value={startingLives}
									onChange={(e) => setStartingLives(Number(e.target.value))}
									className="w-24"
								/>
							</div>
						)}

						{(mode === 'turbo' || mode === 'cup') && (
							<div className="flex items-center gap-2">
								<Label htmlFor="picks">Number of picks</Label>
								<Input
									id="picks"
									type="number"
									min={1}
									max={20}
									value={numberOfPicks}
									onChange={(e) => setNumberOfPicks(Number(e.target.value))}
									className="w-24"
								/>
							</div>
						)}

						{error && <p className="text-sm text-[var(--eliminated)]">{error}</p>}

						<Button type="submit" disabled={!canSubmit} className="w-full">
							{loading ? 'Creating...' : 'Create game'}
						</Button>
					</>
				)}
			</form>
		</Card>
	)
}
