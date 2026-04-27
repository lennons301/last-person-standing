import type { ReactElement } from 'react'

export function Header({
	gameName,
	modeLabel,
	competitionName,
	pot,
	livePill,
	completePill,
	livePillLabel,
}: {
	gameName: string
	modeLabel: string
	competitionName: string
	pot: string
	livePill?: boolean
	completePill?: boolean
	livePillLabel?: string
}): ReactElement {
	return (
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
						alignItems: 'center',
						fontSize: '48px',
						fontWeight: 700,
						color: '#1a1a1a',
						lineHeight: 1,
						gap: '12px',
					}}
				>
					<span style={{ display: 'flex' }}>{gameName}</span>
					{livePill && (
						<span
							style={{
								display: 'flex',
								background: '#dc2626',
								color: '#fff',
								fontSize: '20px',
								fontWeight: 700,
								padding: '4px 10px',
								borderRadius: '6px',
								letterSpacing: '0.04em',
							}}
						>
							{livePillLabel ?? 'LIVE'}
						</span>
					)}
					{completePill && (
						<span
							style={{
								display: 'flex',
								background: '#16a34a',
								color: '#fff',
								fontSize: '18px',
								fontWeight: 700,
								padding: '4px 10px',
								borderRadius: '6px',
								letterSpacing: '0.04em',
							}}
						>
							COMPLETE
						</span>
					)}
				</div>
				<div
					style={{
						display: 'flex',
						fontSize: '24px',
						color: '#6b6b6b',
						marginTop: '8px',
					}}
				>
					{`${modeLabel} · ${competitionName}`}
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
					{`£${pot}`}
				</div>
			</div>
		</div>
	)
}

export function Footer({ generatedAt }: { generatedAt: Date }): ReactElement {
	const dateLabel = generatedAt.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	})
	return (
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
	)
}

export function OverflowTailRow({ count, label }: { count: number; label: string }): ReactElement {
	return (
		<div
			style={{
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				padding: '12px 0',
				fontSize: '14px',
				color: '#9a9a9a',
				fontStyle: 'italic',
			}}
		>
			{`+${count} more ${label}`}
		</div>
	)
}

export function PageFrame({
	height,
	children,
}: {
	height: number
	children: ReactElement | ReactElement[]
}): ReactElement {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				width: '1080px',
				minHeight: `${height}px`,
				background: '#f6f5f1',
				padding: '48px',
				fontFamily: 'sans-serif',
			}}
		>
			{children}
		</div>
	)
}

export function modeLabel(mode: 'classic' | 'cup' | 'turbo'): string {
	return mode[0].toUpperCase() + mode.slice(1)
}
