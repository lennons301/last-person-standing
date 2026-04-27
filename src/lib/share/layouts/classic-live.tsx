import type { ReactElement } from 'react'
import type { LiveShareData } from '../data'
import { Footer, Header, modeLabel } from '../shared'

const ROW_HEIGHT = 44

const STATE_COLOUR: Record<string, string> = {
	winning: '#16a34a',
	drawing: '#ca8a04',
	losing: '#dc2626',
	pending: '#9a9a9a',
}

const STATE_BG: Record<string, string> = {
	winning: '#dcfce7',
	drawing: '#fef9c3',
	losing: '#fee2e2',
	pending: '#f0eee9',
}

export interface LayoutRender {
	jsx: ReactElement
	width: number
	height: number
}

export function classicLiveLayout(data: Extract<LiveShareData, { mode: 'classic' }>): LayoutRender {
	const rows = data.rows
	const height = Math.max(500, 220 + rows.length * ROW_HEIGHT)

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
						fontSize: '14px',
						fontWeight: 700,
						color: '#9a9a9a',
						textTransform: 'uppercase',
						letterSpacing: '0.05em',
						paddingBottom: '8px',
						borderBottom: '1px solid #e8e6e1',
					}}
				>
					Picks &amp; live state
				</div>
				{rows.map((r) => (
					<div
						key={r.id}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '12px',
							padding: '10px 4px',
							borderBottom: '1px solid #f0eee9',
							height: `${ROW_HEIGHT}px`,
						}}
					>
						<div
							style={{
								display: 'flex',
								width: '32px',
								height: '32px',
								borderRadius: '16px',
								background: STATE_COLOUR[r.liveState],
								color: '#fff',
								fontSize: '14px',
								fontWeight: 700,
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							{r.name.charAt(0).toUpperCase()}
						</div>
						<div style={{ display: 'flex', flex: 1, fontSize: '20px', fontWeight: 600 }}>
							{`${r.name} — ${r.pickedTeamShort ?? '—'}`}
						</div>
						<div
							style={{
								display: 'flex',
								fontSize: '20px',
								fontWeight: 800,
								color: STATE_COLOUR[r.liveState],
								width: '120px',
								justifyContent: 'flex-end',
							}}
						>
							{r.homeScore != null && r.awayScore != null
								? `${r.homeScore} - ${r.awayScore}`
								: r.fixtureStatus === 'scheduled'
									? 'KO'
									: '—'}
						</div>
						<div
							style={{
								display: 'flex',
								fontSize: '12px',
								fontWeight: 700,
								background: STATE_BG[r.liveState],
								color: STATE_COLOUR[r.liveState],
								padding: '4px 10px',
								borderRadius: '4px',
								width: '90px',
								justifyContent: 'center',
							}}
						>
							{r.liveState}
						</div>
					</div>
				))}
			</div>
			<Footer generatedAt={data.header.generatedAt} />
		</div>
	)

	return { jsx, width: 1080, height }
}
