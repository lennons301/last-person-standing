import type { ReactElement } from 'react'
import { getTeamColour } from '@/lib/teams/colours'
import type { StandingsShareData } from '../data'
import { Footer, Header, modeLabel, OverflowTailRow } from '../shared'

const RESULT_COLOUR: Record<string, string> = {
	win: '#16a34a',
	loss: '#dc2626',
	draw: '#dc2626',
	draw_exempt: '#ca8a04',
	saved: '#8b5cf6',
	pending: '#2563eb',
}

const STANDINGS_ALIVE_CAP = 20
const STANDINGS_ELIMINATED_CAP = 10

export interface ClassicStandingsRender {
	jsx: ReactElement
	width: number
	height: number
}

export function classicStandingsLayout(
	data: Extract<StandingsShareData, { mode: 'classic' }>,
): ClassicStandingsRender {
	const grid = data.classicGrid
	const players = [...grid.players].sort((a, b) => {
		if (a.status === 'alive' && b.status !== 'alive') return -1
		if (a.status !== 'alive' && b.status === 'alive') return 1
		if (a.status === 'eliminated' && b.status === 'eliminated') {
			return (b.eliminatedRoundNumber ?? 0) - (a.eliminatedRoundNumber ?? 0)
		}
		return a.name.localeCompare(b.name)
	})

	const alive = players.filter((p) => p.status === 'alive').slice(0, STANDINGS_ALIVE_CAP)
	const eliminated = players.filter((p) => p.status !== 'alive').slice(0, STANDINGS_ELIMINATED_CAP)
	const visible = [...alive, ...eliminated]
	const overflow = players.length - visible.length

	const visibleRounds = grid.rounds.slice(-6)
	const height = Math.max(600, 260 + visible.length * 52 + (overflow > 0 ? 40 : 0))

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
					fontSize: '20px',
					marginTop: '-16px',
					marginBottom: '20px',
					gap: '16px',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a' }}>
					<div style={{ width: 10, height: 10, borderRadius: 5, background: '#16a34a' }} />
					<div style={{ display: 'flex' }}>{`${grid.aliveCount} alive`}</div>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626' }}>
					<div style={{ width: 10, height: 10, borderRadius: 5, background: '#dc2626' }} />
					<div style={{ display: 'flex' }}>{`${grid.eliminatedCount} eliminated`}</div>
				</div>
			</div>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					background: '#ffffff',
					borderRadius: '16px',
					padding: '24px',
					border: '1px solid #e8e6e1',
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						fontSize: '16px',
						color: '#9a9a9a',
						fontWeight: 600,
						paddingBottom: '12px',
						borderBottom: '1px solid #e8e6e1',
					}}
				>
					<div style={{ display: 'flex', width: '160px' }}>Player</div>
					<div style={{ display: 'flex', flex: 1, gap: '6px' }}>
						{visibleRounds.map((r) => (
							<div
								key={r.id}
								style={{
									display: 'flex',
									flex: 1,
									justifyContent: 'center',
									fontSize: '14px',
								}}
							>
								{`GW${r.number}`}
							</div>
						))}
					</div>
					<div style={{ display: 'flex', width: '100px', justifyContent: 'flex-end' }}>Status</div>
				</div>
				{visible.map((player) => (
					<div
						key={player.id}
						style={{
							display: 'flex',
							alignItems: 'center',
							padding: '10px 0',
							borderBottom: '1px solid #f0eee9',
							opacity: player.status === 'eliminated' ? 0.5 : 1,
						}}
					>
						<div
							style={{
								display: 'flex',
								width: '160px',
								fontSize: '20px',
								fontWeight: 600,
								color: '#1a1a1a',
							}}
						>
							{player.name}
						</div>
						<div style={{ display: 'flex', flex: 1, gap: '6px' }}>
							{visibleRounds.map((r) => {
								const cell = player.cellsByRoundId[r.id] ?? { result: 'empty' }
								if (cell.result === 'empty') {
									return <div key={r.id} style={{ display: 'flex', flex: 1 }} />
								}
								if (cell.result === 'skull') {
									return (
										<div
											key={r.id}
											style={{
												display: 'flex',
												flex: 1,
												justifyContent: 'center',
												alignItems: 'center',
												fontSize: '24px',
											}}
										>
											💀
										</div>
									)
								}
								if (cell.result === 'no_pick') {
									return (
										<div
											key={r.id}
											style={{
												display: 'flex',
												flex: 1,
												flexDirection: 'column',
												justifyContent: 'center',
												alignItems: 'center',
												background: '#fef9c3',
												color: '#ca8a04',
												fontWeight: 700,
												borderRadius: '6px',
												padding: '6px 4px',
											}}
										>
											<div style={{ display: 'flex', fontSize: '18px', lineHeight: 1 }}>?</div>
											<div
												style={{
													display: 'flex',
													fontSize: '10px',
													fontWeight: 500,
													marginTop: '2px',
												}}
											>
												No pick
											</div>
										</div>
									)
								}
								if (cell.result === 'locked') {
									return (
										<div
											key={r.id}
											style={{
												display: 'flex',
												flex: 1,
												flexDirection: 'column',
												justifyContent: 'center',
												alignItems: 'center',
												background: '#f0eee9',
												color: '#6b6b6b',
												fontWeight: 600,
												borderRadius: '6px',
												padding: '6px 4px',
												border: '1px dashed #c9c7c2',
											}}
										>
											<div style={{ display: 'flex', fontSize: '16px', lineHeight: 1 }}>🔒</div>
											<div
												style={{
													display: 'flex',
													fontSize: '10px',
													fontWeight: 500,
													marginTop: '2px',
												}}
											>
												Locked in
											</div>
										</div>
									)
								}
								const bg = RESULT_COLOUR[cell.result] ?? '#888'
								const teamAccent = cell.teamShortName ? getTeamColour(cell.teamShortName) : bg
								const opponentLabel = cell.opponentShortName
									? `${cell.homeAway === 'A' ? '@' : 'v'}${cell.opponentShortName}`
									: null
								return (
									<div
										key={r.id}
										style={{
											display: 'flex',
											flex: 1,
											flexDirection: 'column',
											justifyContent: 'center',
											alignItems: 'center',
											background: bg,
											color: '#fff',
											fontWeight: 700,
											borderRadius: '6px',
											padding: '6px 4px',
											borderLeft: `4px solid ${teamAccent}`,
										}}
									>
										<div style={{ display: 'flex', fontSize: '16px' }}>
											{cell.teamShortName ?? '?'}
										</div>
										{opponentLabel && (
											<div
												style={{
													display: 'flex',
													fontSize: '11px',
													fontWeight: 400,
													opacity: 0.85,
													marginTop: '2px',
												}}
											>
												{opponentLabel}
											</div>
										)}
									</div>
								)
							})}
						</div>
						<div
							style={{
								display: 'flex',
								width: '100px',
								justifyContent: 'flex-end',
								alignItems: 'center',
							}}
						>
							{player.status === 'alive' ? (
								<div
									style={{
										display: 'flex',
										fontSize: '14px',
										fontWeight: 700,
										background: '#dcfce7',
										color: '#16a34a',
										padding: '4px 10px',
										borderRadius: '6px',
									}}
								>
									alive
								</div>
							) : (
								<div
									style={{
										display: 'flex',
										fontSize: '14px',
										fontWeight: 700,
										background: '#fee2e2',
										color: '#dc2626',
										padding: '4px 10px',
										borderRadius: '6px',
									}}
								>
									{`GW${player.eliminatedRoundNumber}`}
								</div>
							)}
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
