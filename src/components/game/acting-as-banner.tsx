'use client'
import { useRouter } from 'next/navigation'

interface ActingAsBannerProps {
	gameId: string
	targetUserName: string
	targetAvatarInitials: string
}

export function ActingAsBanner({
	gameId,
	targetUserName,
	targetAvatarInitials,
}: ActingAsBannerProps) {
	const router = useRouter()
	return (
		<div className="mx-4 mt-3 flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-primary-foreground">
			<span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/25 text-[11px] font-bold">
				{targetAvatarInitials}
			</span>
			<div className="flex flex-col">
				<span className="text-[10px] font-black uppercase tracking-wider opacity-85">
					Admin mode
				</span>
				<span className="text-sm font-semibold">You're picking for {targetUserName}</span>
			</div>
			<button
				type="button"
				onClick={() => router.push(`/game/${gameId}`)}
				className="ml-auto rounded-md bg-black/25 px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground"
			>
				Exit admin mode
			</button>
		</div>
	)
}
