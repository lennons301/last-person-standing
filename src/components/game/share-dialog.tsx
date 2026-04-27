'use client'

import { Check, Copy, Download, MessageCircle } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'

type Variant = 'standings' | 'live' | 'winner'

interface ShareDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	gameId: string
	gameName: string
	pot: string
	inviteUrl: string
	inviteCode: string
	defaultVariant: Variant
	liveAvailable: boolean
	winnerAvailable: boolean
}

const VARIANT_LABEL: Record<Variant, string> = {
	standings: 'Standings',
	live: 'Live (match-day)',
	winner: 'Winner',
}

export function ShareDialog({
	open,
	onOpenChange,
	gameId,
	gameName,
	pot,
	inviteUrl,
	inviteCode,
	defaultVariant,
	liveAvailable,
	winnerAvailable,
}: ShareDialogProps) {
	const [copied, setCopied] = useState(false)
	const [variant, setVariant] = useState<Variant>(defaultVariant)

	const inviteMessage = `Join me in ${gameName} on Last Person Standing — £${pot} pot. ${inviteUrl}`
	const whatsappHref = `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`

	const cacheBust = open ? Math.floor(Date.now() / 60000) : 0
	const imageUrl =
		variant === 'winner'
			? `/api/share/${variant}/${gameId}`
			: `/api/share/${variant}/${gameId}?t=${cacheBust}`

	async function handleCopy() {
		await navigator.clipboard.writeText(inviteUrl)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Share game</DialogTitle>
					<DialogDescription>
						Invite players or share the current state of {gameName}.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-5">
					<div>
						<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
							Invite link
						</div>
						<div className="flex gap-2">
							<input
								readOnly
								value={inviteUrl}
								className="flex-1 px-3 py-2 text-sm bg-muted rounded-md border border-border font-mono min-w-0 truncate"
							/>
							<Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0 gap-1">
								{copied ? (
									<>
										<Check className="h-3.5 w-3.5" /> Copied
									</>
								) : (
									<>
										<Copy className="h-3.5 w-3.5" /> Copy
									</>
								)}
							</Button>
						</div>
						<div className="text-xs text-muted-foreground mt-1.5">
							Or share the code: <span className="font-mono font-semibold">{inviteCode}</span>
						</div>
						<Button asChild variant="outline" size="sm" className="mt-2 gap-1.5">
							<a href={whatsappHref} target="_blank" rel="noopener noreferrer">
								<MessageCircle className="h-3.5 w-3.5" />
								Share invite to WhatsApp
							</a>
						</Button>
					</div>

					<div>
						<div className="flex items-center justify-between mb-2">
							<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Game state image
							</div>
							<div className="flex gap-2 items-center">
								<Select value={variant} onValueChange={(v) => setVariant(v as Variant)}>
									<SelectTrigger className="h-8 text-xs w-[160px]">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="standings">{VARIANT_LABEL.standings}</SelectItem>
										<SelectItem value="live" disabled={!liveAvailable}>
											{VARIANT_LABEL.live}
										</SelectItem>
										<SelectItem value="winner" disabled={!winnerAvailable}>
											{VARIANT_LABEL.winner}
										</SelectItem>
									</SelectContent>
								</Select>
								<Button asChild variant="outline" size="sm" className="gap-1.5">
									<a href={imageUrl} download={`${gameName.replace(/\s+/g, '-')}-${variant}.png`}>
										<Download className="h-3.5 w-3.5" />
										Download
									</a>
								</Button>
							</div>
						</div>
						<div className="rounded-md border border-border bg-muted/30 overflow-hidden">
							<Image
								src={imageUrl}
								alt={`${gameName} ${variant}`}
								width={1080}
								height={600}
								unoptimized
								className="w-full h-auto"
							/>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
