import type { ReactElement } from 'react'
import type { StandingsShareData } from '../data'
import { Footer, Header, modeLabel, OverflowTailRow } from '../shared'

const ALIVE_CAP = 20
const ELIM_CAP = 10
const ROW_HEIGHT = 56

export interface LayoutRender {
	jsx: ReactElement
	width: number
	height: number
}

export function turboStandingsLayout(
	data: Extract<StandingsShareData, { mode: 'turbo' }>,
): LayoutRender {
	const turbo = data.turboData
	const latestRound = turbo.rounds[turbo.rounds.length - 1]
	const players = latestRound?.players ?? []
	const numberOfPicks = players[0]?.picks.length ?? 10
	const sorted = [...players].sort((a, b) => b.streak - a.streak || b.goals - a.goals)
	const visible = sorted.slice(0, ALIVE_CAP + ELIM_CAP)
	const overflow = sorted.length - visible.length
	const height = Math.max(700, 320 + visible.length * ROW_HEIGHT + (overflow > 0 ? 40 : 0))

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
					<div style={{ display: 'flex', width: '200px' }}>Player</div>
					<div style={{ display: 'flex', width: '60px', justifyContent: 'center' }}>Strk</div>
					<div style={{ display: 'flex', width: '60px', justifyContent: 'center' }}>Gls</div>
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
				{visible.map((player, idx) => (
					<div
						key={player.id}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '8px',
							padding: '8px 0',
							borderBottom: '1px solid #f0eee9',
							height: `${ROW_HEIGHT}px`,
						}}
					>
						<div style={{ display: 'flex', width: '32px', fontWeight: 800, color: '#6b6b6b' }}>
							{idx + 1}
						</div>
						<div style={{ display: 'flex', width: '200px', fontWeight: 600, fontSize: '18px' }}>
							{player.name}
						</div>
						<div
							style={{
								display: 'flex',
								width: '60px',
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
								width: '60px',
								justifyContent: 'center',
								fontWeight: 700,
								fontSize: '16px',
							}}
						>
							{player.goals || '—'}
						</div>
						<div style={{ display: 'flex', flex: 1, gap: '4px' }}>
							{Array.from({ length: numberOfPicks }).map((_, i) => {
								const pick = player.picks.find((pp) => pp.rank === i + 1)
								let bg = 'transparent'
								let border = '1px dashed #e8e6e1'
								let color = '#fff'
								// Two-line cell:
								//   primary = picked team shortName (or 'DRAW')
								//   secondary = opponent context, so the fixture is identifiable
								//     home_win → "v {awayShort}"
								//     away_win → "@ {homeShort}"
								//     draw     → "{homeShort}-{awayShort}"
								// Single-line H/D/A or a bare 'DRAW' loses the fixture identity
								// when the image gets shared without context — fixed PR #58 follow-up.
								const primary = pick
									? pick.prediction === 'home_win'
										? pick.homeShort
										: pick.prediction === 'away_win'
											? pick.awayShort
											: 'DRAW'
									: ''
								const secondary = pick
									? pick.prediction === 'home_win'
										? `v ${pick.awayShort}`
										: pick.prediction === 'away_win'
											? `@ ${pick.homeShort}`
											: `${pick.homeShort}-${pick.awayShort}`
									: ''
								let isHidden = false
								if (pick) {
									if (pick.result === 'hidden') {
										bg = '#f0eee9'
										color = '#6b6b6b'
										border = 'none'
										isHidden = true
									} else if (pick.result === 'win') {
										bg = '#16a34a'
										border = 'none'
									} else if (pick.result === 'loss') {
										bg = '#dc2626'
										border = 'none'
									} else {
										bg = '#2563eb'
										border = 'none'
									}
								}
								// Satori (Vercel's JSX-to-image renderer) needs `display: flex`
								// on every element AND a single child per conditional branch —
								// React Fragments inside a flex column don't reliably stack.
								// Wrapping the two lines in a single nested flex-column div fixes
								// the "MUN" + "v LIV" rendering side-by-side instead of stacked.
								const cellContent = isHidden ? (
									<div style={{ display: 'flex', fontSize: '14px' }}>🔒</div>
								) : pick ? (
									<div
										style={{
											display: 'flex',
											flexDirection: 'column',
											alignItems: 'center',
											justifyContent: 'center',
										}}
									>
										<div style={{ display: 'flex', fontSize: '12px', lineHeight: 1 }}>
											{primary}
										</div>
										<div
											style={{
												display: 'flex',
												fontSize: '9px',
												fontWeight: 600,
												opacity: 0.85,
												lineHeight: 1,
												marginTop: '3px',
											}}
										>
											{secondary}
										</div>
									</div>
								) : (
									<div style={{ display: 'flex' }} />
								)
								return (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: rank columns are stable
										key={`cell-${player.id}-${i}`}
										style={{
											display: 'flex',
											flex: 1,
											height: '42px',
											borderRadius: '4px',
											background: bg,
											border,
											color,
											alignItems: 'center',
											justifyContent: 'center',
											fontWeight: 700,
										}}
									>
										{cellContent}
									</div>
								)
							})}
						</div>
					</div>
				))}
				{overflow > 0 && <OverflowTailRow count={overflow} label="players not shown" />}
			</div>
			<Footer generatedAt={data.header.generatedAt} />
		</div>
	)

	return { jsx, width: 1080, height }
}
