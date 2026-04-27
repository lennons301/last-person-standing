import type { ReactElement } from 'react'
import type { LiveShareData } from '../data'
import { Footer, Header, modeLabel, OverflowTailRow } from '../shared'

const ROW_HEIGHT = 44

export interface LayoutRender {
	jsx: ReactElement
	width: number
	height: number
}

export function turboLiveLayout(data: Extract<LiveShareData, { mode: 'turbo' }>): LayoutRender {
	const turbo = data.turboData
	const latestRound = turbo.rounds[turbo.rounds.length - 1]
	const players = latestRound?.players ?? []
	const numberOfPicks = players[0]?.picks.length ?? 10
	const sorted = [...players].sort((a, b) => b.streak - a.streak || b.goals - a.goals)
	const visible = sorted.slice(0, 20)
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
								let text = ''
								let color = '#fff'
								if (pick) {
									if (pick.result === 'hidden') {
										bg = '#f0eee9'
										color = '#6b6b6b'
										text = '🔒'
										border = 'none'
									} else if (pick.result === 'win') {
										bg = '#16a34a'
										text =
											pick.prediction === 'home_win'
												? 'H'
												: pick.prediction === 'away_win'
													? 'A'
													: 'D'
										border = 'none'
									} else if (pick.result === 'loss') {
										bg = '#dc2626'
										text =
											pick.prediction === 'home_win'
												? 'H'
												: pick.prediction === 'away_win'
													? 'A'
													: 'D'
										border = 'none'
									} else {
										bg = '#2563eb'
										text =
											pick.prediction === 'home_win'
												? 'H'
												: pick.prediction === 'away_win'
													? 'A'
													: 'D'
										border = 'none'
									}
								}
								return (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: rank columns are stable
										key={`cell-${player.id}-${i}`}
										style={{
											display: 'flex',
											flex: 1,
											height: '34px',
											borderRadius: '4px',
											background: bg,
											border,
											color,
											alignItems: 'center',
											justifyContent: 'center',
											fontWeight: 700,
											fontSize: '12px',
										}}
									>
										{text}
									</div>
								)
							})}
						</div>
					</div>
				))}
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
