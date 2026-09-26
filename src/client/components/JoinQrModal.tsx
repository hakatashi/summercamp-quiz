import {useEffect} from 'react';
import {JoinQrCode} from './JoinQrCode.tsx';
import styles from './JoinQrModal.module.css';

interface Props {
	gameId: string;
	isOpen: boolean;
	onClose: () => void;
}

export const JoinQrModal = ({gameId, isOpen, onClose}: Props) => {
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

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
			aria-labelledby="join-qr-title"
			tabIndex={-1}
		>
			<div className={styles.modal}>
				<div className={styles.titleRow}>
					<h2 id="join-qr-title" className={styles.title}>
						参加用 QR コード
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
				<JoinQrCode gameId={gameId} size={280} />
			</div>
		</div>
	);
};
