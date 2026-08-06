import Link from 'next/link'

const GALLERIES = [
	{
		href: '/preview/game-hero',
		title: 'Game hero',
		description: 'Top-of-page pick hero + stat line, one card per state × mode.',
	},
	{
		href: '/preview/live-scores',
		title: 'Live scores',
		description: 'The on-demand scores pop-out and its control, one payload per live scenario.',
	},
]

export default function PreviewIndexPage() {
	return (
		<ul className="space-y-2">
			{GALLERIES.map((g) => (
				<li key={g.href}>
					<Link
						href={g.href}
						className="block rounded-lg border border-border bg-card p-4 hover:bg-muted/40"
					>
						<div className="font-semibold text-sm">{g.title}</div>
						<div className="text-xs text-muted-foreground mt-0.5">{g.description}</div>
					</Link>
				</li>
			))}
		</ul>
	)
}
