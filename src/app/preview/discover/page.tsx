import { buildDiscoverFixtures } from '@/app/preview/discover/fixtures'
import { DiscoverGameCard } from '@/components/game/discover-game-card'
import { InProgressGamesSection } from '@/components/game/in-progress-games-section'
import { OpenGamesSection } from '@/components/game/open-games-section'

// Fixtures are relative to render time — a game "open" at build time would be
// under way by the time anyone looked — so never cache this page.
export const dynamic = 'force-dynamic'

/** The phone column: 375px of viewport minus the page's own `px-4`. */
function MobileColumn({ children }: { children: React.ReactNode }) {
	return (
		<div className="w-[375px] max-w-full shrink-0 rounded-lg border border-dashed border-border/70 p-1">
			<div className="text-2xs uppercase tracking-wide text-muted-foreground/70 mb-1 px-1">
				375px
			</div>
			<div className="px-4">{children}</div>
		</div>
	)
}

export default function DiscoverPreviewPage() {
	const view = buildDiscoverFixtures(new Date())
	const open = view.openToJoin[0]
	const started = view.inProgress[0]

	return (
		<div className="space-y-10">
			<div className="space-y-2 text-sm text-muted-foreground">
				<p>
					The home page's discovery half: public games the viewer isn't in. Hand-built rows run
					through the real <code>buildDiscoverView</code>, so which games appear, which section they
					land in and what order they're in are the builder's answers rather than the fixture's. No
					auth, no database.
				</p>
				<p>
					The fixture feeds in three games that must never be listed — a private one, one the viewer
					is already a player in, and a completed one — and none of them appears below.
				</p>
			</div>

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">The card</h2>
				<p className="text-sm text-muted-foreground">
					A game you're not in, so nothing on it is about you: name, mode and competition, how many
					players are in (with the cap where the game sets one), the entry fee, and when it starts.
					No pot — it counts paid entries, so before a game starts a paid game would read as free —
					and no creator name. Open leads into the join flow; in progress is de-emphasised and leads
					to the game page, which says the admin can add you.
				</p>
			</header>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				<DiscoverGameCard game={open} state="open" />
				<DiscoverGameCard game={started} state="in-progress" />
			</div>
			<MobileColumn>
				<div className="space-y-3">
					<DiscoverGameCard game={open} state="open" />
					<DiscoverGameCard game={started} state="in-progress" />
				</div>
			</MobileColumn>

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">Open to join</h2>
				<p className="text-sm text-muted-foreground">
					Soonest start first — the free turbo game kicking off in six hours sits above the one 30
					hours out, and the World Cup cup game, whose pre-draw round carries no deadline, sits last
					with its date to be confirmed rather than at the top as an unknown.
				</p>
			</header>
			<OpenGamesSection games={view.openToJoin} />
			<MobileColumn>
				<OpenGamesSection games={view.openToJoin} />
			</MobileColumn>

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">In progress</h2>
				<p className="text-sm text-muted-foreground">
					Collapsed on load with its count and a show/hide control, the shape past games already
					take. It isn't a call to action: these can't be joined. Two games — one past its opening
					deadline, one that has advanced beyond its opening round — most recently started first.
				</p>
			</header>
			<InProgressGamesSection games={view.inProgress} />
			<MobileColumn>
				<InProgressGamesSection games={view.inProgress} />
			</MobileColumn>

			<header className="border-t border-border pt-6">
				<h2 className="font-display text-lg font-semibold">Nothing to show</h2>
				<p className="text-sm text-muted-foreground">
					Both sections render nothing at all when they have no games — no empty header announcing a
					shortage nobody asked about. There is a horizontal rule below this paragraph and the next
					section's; between them is both sections given an empty list.
				</p>
			</header>
			<div className="border-y border-border py-2">
				<OpenGamesSection games={[]} />
				<InProgressGamesSection games={[]} />
			</div>
		</div>
	)
}
