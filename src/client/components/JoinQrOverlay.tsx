import {JoinQrCode} from './JoinQrCode.tsx';
import styles from './JoinQrOverlay.module.css';

/** モニターの待機画面 (本戦開始前) の隅に重ねる、参加用 QR コードのパネル */
export const JoinQrOverlay = ({gameId}: {gameId: string}) => (
	<div className={styles.panel}>
		<p className={styles.label}>スマホから参加</p>
		<JoinQrCode gameId={gameId} size={200} />
	</div>
);
