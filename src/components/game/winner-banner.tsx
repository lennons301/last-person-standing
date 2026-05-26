import type { LucideIcon } from 'lucide-react'

export interface WinnerStat {
	icon: LucideIcon
	value: number | string
	label: string
}

export interface WinnerBannerEntry {
	userId: string
	name: string
	potShare: string
	stats: WinnerStat[]
}

interface WinnerBannerProps {
	winners: WinnerBannerEntry[]
	runnerUpName?: string
}

export function WinnerBanner({ winners, runnerUpName }: WinnerBannerProps) {
	if (winners.length === 0) return null
	const isSplit = winners.length > 1

	return (
		<div className="mb-6 overflow-hidden rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 via-amber-50 to-yellow-100 shadow-sm">
			<div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100/60 px-5 py-3">
				<span className="text-xl" aria-hidden>
					🏆
				</span>
				<span className="font-display text-xs font-bold uppercase tracking-wider text-amber-900">
					{isSplit ? `Split pot · ${winners.length} way` : 'Winner'}
				</span>
				<span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-amber-700">
					Game complete
				</span>
			</div>
			<ul className="divide-y divide-amber-200/70">
				{winners.map((w, idx) => (
					<li key={w.userId} className="flex items-center gap-4 px-5 py-4">
						<span className="text-2xl shrink-0" aria-hidden>
							🥇
						</span>
						<div className="min-w-0 flex-1">
							<div className="font-display text-xl font-bold text-amber-950 truncate">{w.name}</div>
							{w.stats.length > 0 && (
								<div className="mt-0.5 flex items-center gap-3 text-xs text-amber-800">
									{w.stats.map((s) => {
										const Icon = s.icon
										return (
											<span key={s.label} className="inline-flex items-center gap-1">
												<Icon className="h-3 w-3" />
												<span className="font-semibold">{s.value}</span>
												<span className="text-amber-700/80">{s.label}</span>
											</span>
										)
									})}
								</div>
							)}
						</div>
						<div className="text-right shrink-0">
							<div className="font-display text-2xl font-bold leading-none text-amber-900">
								£{w.potShare}
							</div>
							<div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
								{isSplit ? 'share' : idx === 0 ? 'won' : ''}
							</div>
						</div>
					</li>
				))}
			</ul>
			{runnerUpName && (
				<div className="border-t border-amber-200 bg-amber-50/80 px-5 py-2 text-[11px] text-amber-800">
					Runner-up: <span className="font-semibold text-amber-900">{runnerUpName}</span>
				</div>
			)}
		</div>
	)
}
