'use client'

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'

interface RuleSection {
	heading: string
	items: string[]
}

interface ModeRules {
	title: string
	intro: string
	sections: RuleSection[]
}

// Player-facing rules summaries, distilled from docs/game-modes/*.md.
// These explain the mechanics a player needs at the table — not the full
// settlement model. Keep them short and plain-English.
const RULES: Record<string, ModeRules> = {
	classic: {
		title: 'Classic',
		intro: 'Last person standing. One pick per round — if your team doesn’t win, you’re out.',
		sections: [
			{
				heading: 'Each round',
				items: [
					'Pick exactly one team to win their match.',
					'They win → you survive to the next round.',
					'They lose or draw → you’re eliminated. (A draw in the opening round is safe.)',
					'You can’t pick the same team twice in a game.',
				],
			},
			{
				heading: 'Winning',
				items: [
					'The last player left standing takes the pot.',
					'If everyone is knocked out in the same round, the survivors of that round split it.',
				],
			},
		],
	},
	turbo: {
		title: 'Turbo',
		intro: 'One round, many predictions, ranked by confidence. Longest correct streak wins.',
		sections: [
			{
				heading: 'Your predictions',
				items: [
					'Predict each fixture: home win, draw, or away win.',
					'Rank your predictions by confidence — 1 is your most confident call.',
					'You submit all of them in one go (no partial entries).',
				],
			},
			{
				heading: 'Scoring',
				items: [
					'Your score is your longest run of correct picks starting from rank 1.',
					'The first wrong prediction ends your streak — later correct picks don’t count.',
					'Highest streak wins; ties broken by goals scored during the streak. A perfect tie splits the pot.',
				],
			},
		],
	},
	cup: {
		title: 'Cup',
		intro:
			'Confidence-ranked predictions with a tier handicap and a lives system. Reward the brave underdog calls.',
		sections: [
			{
				heading: 'Your predictions',
				items: [
					'Rank the round’s fixtures by confidence (1 = most confident).',
					'You don’t have to rank them all — partial rankings are allowed.',
					'You can’t back a team more than one tier stronger than its opponent.',
				],
			},
			{
				heading: 'Underdog rewards',
				items: [
					'Beat a stronger team and you win lives: +1, +2 or +3 for a 1-, 2- or 3-tier underdog.',
					'Drawing as an underdog still counts as a success — and a 2- or 3-tier underdog draw earns a life.',
				],
			},
			{
				heading: 'Lives & survival',
				items: [
					'A wrong call breaks your streak — unless you spend a life to survive it.',
					'Run out of lives and your streak breaks: you’re done for the round.',
					'Lives are earned, not handed out (unless the organiser sets a starting number).',
					'Survive every round to the final; standings are ranked by streak, then lives, then goals.',
				],
			},
		],
	},
}

interface GameRulesDialogProps {
	mode: string
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function GameRulesDialog({ mode, open, onOpenChange }: GameRulesDialogProps) {
	const rules = RULES[mode.toLowerCase()] ?? RULES.classic

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{rules.title} — how it works</DialogTitle>
					<DialogDescription>{rules.intro}</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					{rules.sections.map((section) => (
						<div key={section.heading}>
							<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{section.heading}
							</h3>
							<ul className="mt-1.5 space-y-1.5">
								{section.items.map((item) => (
									<li key={item} className="flex gap-2 text-sm leading-relaxed">
										<span
											aria-hidden
											className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/40"
										/>
										<span>{item}</span>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</DialogContent>
		</Dialog>
	)
}
