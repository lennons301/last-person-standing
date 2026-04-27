import type { ReactElement } from 'react'
import type { WinnerShareData } from '../data'
import { Footer, Header, modeLabel, OverflowTailRow } from '../shared'

export interface LayoutRender {
	jsx: ReactElement
	width: number
	height: number
}

export function turboWinnerLayout(data: Extract<WinnerShareData, { mode: 'turbo' }>): LayoutRender {
	const winners = data.winners
	const isSplit = winners.length > 1
	const height = Math.max(
		700,
		340 + winners.length * 70 + data.runnersUp.length * 40 + (data.overflowCount > 0 ? 40 : 0),
	)

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
				completePill
			/>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					background: 'rgba(245,158,11,0.12)',
					border: '1px solid rgba(245,158,11,0.4)',
					borderRadius: '12px',
					padding: '20px 24px',
					marginBottom: '12px',
				}}
			>
				<div
					style={{
						display: 'flex',
						fontSize: '14px',
						fontWeight: 800,
						letterSpacing: '0.1em',
						color: '#92400e',
						textTransform: 'uppercase',
						marginBottom: '12px',
					}}
				>
					{`🏆 ${isSplit ? `SPLIT POT · ${winners.length} WAY` : 'WINNER'}`}
				</div>
				{winners.map((w, idx) => (
					<div
						key={w.userId}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '14px',
							padding: '8px 0',
							borderTop: idx > 0 ? '1px solid rgba(245,158,11,0.25)' : 'none',
						}}
					>
						<div style={{ display: 'flex', fontSize: '32px' }}>🥇</div>
						<div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
							<div style={{ display: 'flex', fontSize: '28px', fontWeight: 800 }}>{w.name}</div>
							<div
								style={{
									display: 'flex',
									fontSize: '14px',
									color: '#6b6b6b',
									marginTop: '2px',
								}}
							>
								{`Streak ${w.turboMeta?.streak ?? 0} · ${w.turboMeta?.goals ?? 0} goals`}
							</div>
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
							<div
								style={{
									display: 'flex',
									fontSize: '24px',
									fontWeight: 800,
									color: '#92400e',
								}}
							>
								{`£${w.potShare}`}
							</div>
							<div
								style={{
									display: 'flex',
									fontSize: '11px',
									color: '#6b6b6b',
									textTransform: 'uppercase',
									letterSpacing: '0.08em',
								}}
							>
								{isSplit ? 'share' : 'won'}
							</div>
						</div>
					</div>
				))}
			</div>
			{data.runnersUp.length > 0 && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						background: '#fff',
						border: '1px solid #e8e6e1',
						borderRadius: '12px',
						padding: '16px 20px',
					}}
				>
					<div
						style={{
							display: 'flex',
							fontSize: '12px',
							fontWeight: 700,
							color: '#9a9a9a',
							textTransform: 'uppercase',
							letterSpacing: '0.1em',
							marginBottom: '8px',
						}}
					>
						Close finishes
					</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '12px',
							fontSize: '12px',
							fontWeight: 700,
							color: '#9a9a9a',
							textTransform: 'uppercase',
							letterSpacing: '0.04em',
							paddingBottom: '4px',
						}}
					>
						<div style={{ display: 'flex', width: '32px' }}>#</div>
						<div style={{ display: 'flex', flex: 1 }}>Player</div>
						<div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>Strk</div>
						<div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>Gls</div>
					</div>
					{data.runnersUp.map((r, idx) => (
						<div
							key={r.userId}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '12px',
								padding: '6px 0',
								borderTop: idx > 0 ? '1px solid #f0eee9' : 'none',
								fontSize: '16px',
							}}
						>
							<div style={{ display: 'flex', width: '32px', fontWeight: 800, color: '#6b6b6b' }}>
								{idx + 1 + winners.length}
							</div>
							<div style={{ display: 'flex', flex: 1, fontWeight: 600 }}>{r.name}</div>
							<div
								style={{
									display: 'flex',
									width: '50px',
									justifyContent: 'center',
									fontWeight: 700,
								}}
							>
								{r.streak}
							</div>
							<div
								style={{
									display: 'flex',
									width: '50px',
									justifyContent: 'center',
									fontWeight: 700,
								}}
							>
								{r.goals}
							</div>
						</div>
					))}
					{data.overflowCount > 0 && (
						<OverflowTailRow count={data.overflowCount} label="players not shown" />
					)}
				</div>
			)}
			<Footer generatedAt={data.header.generatedAt} />
		</div>
	)

	return { jsx, width: 1080, height }
}
