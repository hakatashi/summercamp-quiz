import {useEffect, useState} from 'react';
import {clockStatus, localNow, toServerTime} from '../lib/clock.ts';
import {socket} from '../lib/socket.ts';
import styles from './ClockDiagnostics.module.css';

interface Props {
	isOpen: boolean;
	onClose: () => void;
}

export const ClockDiagnostics = ({isOpen, onClose}: Props) => {
	const [, setTick] = useState(0);

	useEffect(() => {
		if (!isOpen) return;

		const timer = setInterval(() => {
			setTick((t) => t + 1);
		}, 500);

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', handleKeyDown);

		return () => {
			clearInterval(timer);
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	const {offset, rtt} = clockStatus();
	// biome-ignore lint/suspicious/noExplicitAny: engine.transport is dynamic on socket.io-client
	const transportName = (socket.io as any)?.engine?.transport?.name ?? 'unknown';
	const isConnected = socket.connected;

	const offsetDisplay = `${offset >= 0 ? '+' : ''}${offset.toFixed(1)} ms`;
	const rttDisplay = rtt !== null ? `${rtt.toFixed(1)} ms` : '計測中';

	return (
		<div
			className={styles.overlay}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			onKeyDown={(e) => {
				if (e.key === 'Escape') onClose();
			}}
			role="dialog"
			aria-modal="true"
			aria-labelledby="diag-title"
			tabIndex={-1}
		>
			<div className={styles.modal}>
				<div className={styles.titleRow}>
					<h2 id="diag-title" className={styles.title}>
						接続・時計診断
					</h2>
					<button
						type="button"
						className={styles.closeButton}
						onClick={onClose}
						aria-label="閉じる"
					>
						×
					</button>
				</div>

				<div className={styles.table}>
					<span className={styles.label}>接続状態</span>
					<span
						className={`${styles.value} ${isConnected ? styles.connected : styles.disconnected}`}
					>
						{isConnected ? '接続中' : '切断中'}
					</span>

					<span className={styles.label}>接続方式</span>
					<span
						className={`${styles.value} ${
							transportName === 'websocket'
								? styles.transportWebsocket
								: transportName === 'polling'
									? styles.transportPolling
									: ''
						}`}
					>
						{transportName}
					</span>

					<span className={styles.label}>推定時計差 (offset)</span>
					<span className={styles.value}>{offsetDisplay}</span>

					<span className={styles.label}>最小往復時間 (RTT)</span>
					<span className={styles.value}>{rttDisplay}</span>

					<span className={styles.label}>推定サーバー時刻</span>
					<span className={styles.value}>
						{new Date(toServerTime(localNow())).toLocaleTimeString('ja-JP', {
							hour12: false,
							minute: '2-digit',
							second: '2-digit',
							fractionalSecondDigits: 3,
						})}
					</span>
				</div>

				<p className={styles.note}>時計差は直近サンプルの中で RTT が最小のものを採用しています。</p>
			</div>
		</div>
	);
};
