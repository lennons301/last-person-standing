import type { ReactElement } from 'react'
import type { CupStandingsData } from '@/lib/game/cup-standings-queries'
import type { LiveShareData } from '../data'
import { Footer, Header, modeLabel, OverflowTailRow } from '../shared'

const ROW_HEIGHT = 44

export interface LayoutRender {
	jsx: ReactElement
	width: number
	height: number
}

type CupPlayer = CupStandingsData['players'][number]
type CupPick = CupPlayer['picks'][number]

export function cupLiveLayout(data: Extract<LiveShareData, { mode: 'cup' }>): LayoutRender {
	const cup = data.cupData
	const alive = cup.players
		.filter((p) => p.status !== 'eliminated')
		.sort((a, b) => b.livesRemaining - a.livesRemaining || b.streak - a.streak || b.goals - a.goals)
		.slice(0, 16)
	const recentElim = cup.players
		.filter((p) => p.status === 'eliminated')
		.sort((a, b) => (b.eliminatedRoundNumber ?? 0) - (a.eliminatedRoundNumber ?? 0))
		.slice(0, 4)
	const visible: CupPlayer[] = [...alive, ...recentElim]
	const overflow = cup.players.length - visible.length
	const height = Math.max(700, 320 + visible.length * ROW_HEIGHT + (overflow > 0 ? 40 : 0))

	const numberOfPicks = cup.numberOfPicks

	const jsx = (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				width: '1080px',
				background: '#f6f5f1',
				padding: '48px',
				fontFamily: 'sans-serif',
			}}
		>
			<Header
				gameName={data.header.gameName}
				modeLabel={modeLabel(data.header.gameMode)}
				competitionName={data.header.competitionName}
				pot={data.header.pot}
				livePill
				livePillLabel={`LIVE GW${data.roundNumber}`}
			/>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					background: '#fff',
					border: '1px solid #e8e6e1',
					borderRadius: '12px',
					padding: '20px',
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '8px',
						paddingBottom: '8px',
						borderBottom: '1px solid #e8e6e1',
						fontSize: '14px',
						color: '#9a9a9a',
						fontWeight: 700,
						textTransform: 'uppercase',
						letterSpacing: '0.05em',
					}}
				>
					<div style={{ display: 'flex', width: '32px' }}>#</div>
					<div style={{ display: 'flex', width: '180px' }}>Player</div>
					<div style={{ display: 'flex', width: '90px' }}>Lives</div>
					<div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>Strk</div>
					<div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>Gls</div>
					<div style={{ display: 'flex', flex: 1, gap: '4px' }}>
						{Array.from({ length: numberOfPicks }).map((_, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: rank columns are stable
								key={`hdr-${i}`}
								style={{ display: 'flex', flex: 1, justifyContent: 'center', fontSize: '12px' }}
							>
								{`#${i + 1}`}
							</div>
						))}
					</div>
				</div>
				{visible.map((player, idx) => {
					const isOut = player.status === 'eliminated'
					return (
						<div
							key={player.id}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '8px',
								padding: '8px 0',
								borderBottom: '1px solid #f0eee9',
								opacity: isOut ? 0.55 : 1,
								height: `${ROW_HEIGHT}px`,
							}}
						>
							<div style={{ display: 'flex', width: '32px', fontWeight: 800, color: '#6b6b6b' }}>
								{idx + 1}
							</div>
							<div style={{ display: 'flex', width: '180px', fontWeight: 600, fontSize: '18px' }}>
								{player.name}
							</div>
							<div style={{ display: 'flex', alignItems: 'center', gap: '3px', width: '90px' }}>
								{Array.from({ length: cup.maxLives }).map((_, i) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: stable index
										key={`life-${player.id}-${i}`}
										style={{
											display: 'flex',
											width: '12px',
											height: '12px',
											borderRadius: '6px',
											background: i < player.livesRemaining ? '#dc2626' : 'transparent',
											border: i < player.livesRemaining ? 'none' : '1.5px solid #e8e6e1',
										}}
									/>
								))}
							</div>
							<div
								style={{
									display: 'flex',
									width: '50px',
									justifyContent: 'center',
									fontWeight: 700,
									fontSize: '16px',
								}}
							>
								{player.streak || '—'}
							</div>
							<div
								style={{
									display: 'flex',
									width: '50px',
									justifyContent: 'center',
									fontWeight: 700,
									fontSize: '16px',
								}}
							>
								{player.goals || '—'}
							</div>
							<div style={{ display: 'flex', flex: 1, gap: '4px' }}>
								{Array.from({ length: numberOfPicks }).map((_, i) => {
									const pick = player.picks.find((pp) => pp.confidenceRank === i + 1)
									// biome-ignore lint/suspicious/noArrayIndexKey: rank columns are stable
									return <CupCell key={`cell-${player.id}-${i}`} pick={pick} />
								})}
							</div>
						</div>
					)
				})}
				{overflow > 0 && <OverflowTailRow count={overflow} label="rows not shown" />}
			</div>
			<div
				style={{
					display: 'flex',
					fontSize: '12px',
					color: '#6b6b6b',
					marginTop: '8px',
				}}
			>
				{`Matchups: ${data.matchupsLegend}`}
			</div>
			<Footer generatedAt={data.header.generatedAt} />
		</div>
	)

	return { jsx, width: 1080, height }
}

function CupCell({ pick }: { pick?: CupPick }): ReactElement {
	if (!pick) {
		return (
			<div
				style={{
					display: 'flex',
					flex: 1,
					height: '34px',
					borderRadius: '4px',
					background: 'transparent',
					border: '1px dashed #e8e6e1',
				}}
			/>
		)
	}
	if (pick.result === 'hidden' || pick.result === 'restricted') {
		return (
			<div
				style={{
					display: 'flex',
					flex: 1,
					height: '34px',
					borderRadius: '4px',
					background: '#f0eee9',
					color: '#6b6b6b',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: '12px',
				}}
			>
				{pick.result === 'hidden' ? '🔒' : '—'}
			</div>
		)
	}
	const bg =
		pick.result === 'win'
			? '#16a34a'
			: pick.result === 'saved_by_life'
				? '#f59e0b'
				: pick.result === 'loss'
					? '#dc2626'
					: '#2563eb'
	const label = pick.pickedSide === 'home' ? pick.homeShort : pick.awayShort
	return (
		<div
			style={{
				display: 'flex',
				flex: 1,
				height: '34px',
				borderRadius: '4px',
				background: bg,
				color: '#fff',
				alignItems: 'center',
				justifyContent: 'center',
				fontWeight: 700,
				fontSize: '12px',
			}}
		>
			{label}
		</div>
	)
}
