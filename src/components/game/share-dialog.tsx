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

interface ShareDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	gameId: string
	gameName: string
	pot: string
	inviteUrl: string
	inviteCode: string
}

export function ShareDialog({
	open,
	onOpenChange,
	gameId,
	gameName,
	pot,
	inviteUrl,
	inviteCode,
}: ShareDialogProps) {
	const [copied, setCopied] = useState(false)

	const inviteMessage = `Join me in ${gameName} on Last Person Standing — £${pot} pot. ${inviteUrl}`
	const whatsappHref = `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`

	// Cache-bust the image every time the dialog opens so you always see latest state
	const gridImageUrl = `/api/share/grid/${gameId}?t=${open ? Math.floor(Date.now() / 60000) : 0}`

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
							<Button asChild variant="outline" size="sm" className="gap-1.5">
								<a href={gridImageUrl} download={`${gameName.replace(/\s+/g, '-')}-progress.png`}>
									<Download className="h-3.5 w-3.5" />
									Download
								</a>
							</Button>
						</div>
						<div className="rounded-md border border-border bg-muted/30 overflow-hidden">
							{/* Using unoptimized Image so the PNG streams straight through */}
							<Image
								src={gridImageUrl}
								alt={`${gameName} progress grid`}
								width={1080}
								height={600}
								unoptimized
								className="w-full h-auto"
							/>
						</div>
						<p className="text-xs text-muted-foreground mt-2">
							Live match day snapshots and winner announcements arriving in a future update.
						</p>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
