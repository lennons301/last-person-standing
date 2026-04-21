import { ImageResponse } from 'next/og'
import { requireSession } from '@/lib/auth-helpers'
import { getGameDetail, getProgressGridData } from '@/lib/game/detail-queries'
import { getTeamColour } from '@/lib/teams/colours'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
	const session = await requireSession()
	const { gameId } = await params

	const game = await getGameDetail(gameId, session.user.id)
	if (!game) return new Response('Not found', { status: 404 })
	if (!game.isMember) return new Response('Forbidden', { status: 403 })

	const grid = await getProgressGridData(gameId, session.user.id, {
		hideAllCurrentPicks: true,
	})
	if (!grid) return new Response('No grid data', { status: 404 })

	const players = [...grid.players].sort((a, b) => {
		if (a.status === 'alive' && b.status !== 'alive') return -1
		if (a.status !== 'alive' && b.status === 'alive') return 1
		if (a.status === 'eliminated' && b.status === 'eliminated') {
			return (b.eliminatedRoundNumber ?? 0) - (a.eliminatedRoundNumber ?? 0)
		}
		return a.name.localeCompare(b.name)
	})

	const visibleRounds = grid.rounds.slice(-6)

	const resultColour: Record<string, string> = {
		win: '#16a34a',
		loss: '#dc2626',
		draw: '#dc2626',
		draw_exempt: '#ca8a04',
		saved: '#8b5cf6',
		pending: '#2563eb',
	}

	const modeLabel = game.gameMode[0].toUpperCase() + game.gameMode.slice(1)
	const dateLabel = new Date().toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	})

	return new ImageResponse(
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
			{/* Header */}
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'flex-start',
					marginBottom: '32px',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					<div
						style={{
							display: 'flex',
							fontSize: '48px',
							fontWeight: 700,
							color: '#1a1a1a',
							lineHeight: 1,
						}}
					>
						{game.name}
					</div>
					<div
						style={{
							display: 'flex',
							fontSize: '24px',
							color: '#6b6b6b',
							marginTop: '8px',
						}}
					>
						{`${modeLabel} · ${game.competition.name}`}
					</div>
					<div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '20px' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a' }}>
							<div
								style={{
									width: 10,
									height: 10,
									borderRadius: 5,
									background: '#16a34a',
								}}
							/>
							<div style={{ display: 'flex' }}>{`${grid.aliveCount} alive`}</div>
						</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626' }}>
							<div
								style={{
									width: 10,
									height: 10,
									borderRadius: 5,
									background: '#dc2626',
								}}
							/>
							<div style={{ display: 'flex' }}>{`${grid.eliminatedCount} eliminated`}</div>
						</div>
					</div>
				</div>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'flex-end',
					}}
				>
					<div
						style={{
							display: 'flex',
							fontSize: '14px',
							textTransform: 'uppercase',
							letterSpacing: '0.1em',
							color: '#9a9a9a',
							fontWeight: 600,
						}}
					>
						Pot
					</div>
					<div
						style={{
							display: 'flex',
							fontSize: '72px',
							fontWeight: 700,
							color: '#1a1a1a',
							lineHeight: 1,
						}}
					>
						{`£${grid.pot}`}
					</div>
				</div>
			</div>

			{/* Grid */}
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
				{/* Header row */}
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

				{/* Player rows */}
				{players.map((player) => (
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
								const bg = resultColour[cell.result] ?? '#888'
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
			</div>

			{/* Footer */}
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					marginTop: '24px',
					fontSize: '16px',
					color: '#9a9a9a',
				}}
			>
				<div style={{ display: 'flex' }}>Last Person Standing</div>
				<div style={{ display: 'flex' }}>{dateLabel}</div>
			</div>
		</div>,
		{
			width: 1080,
			height: Math.max(600, 260 + players.length * 52),
		},
	)
}
