import {useState} from 'react';
import {useParams} from 'react-router';
import {HostGate} from '../components/HostGate.tsx';
import {JoinQrModal} from '../components/JoinQrModal.tsx';
import {screens} from '../modes/registry.ts';
import {GameScreen, Unsupported} from './GameScreen.tsx';
import styles from './HostPage.module.css';

export const HostPage = () => {
	const {gameId = ''} = useParams();
	const [qrOpen, setQrOpen] = useState(false);
	return (
		<HostGate>
			{(password) => (
				<GameScreen request={{gameId, role: 'host', password}}>
					{(props) => {
						const Host = screens[props.view.game.mode].Host;
						if (!Host) {
							return <Unsupported screen="司会者画面" />;
						}
						return (
							<>
								<Host {...props} />
								<button type="button" className={styles.qrButton} onClick={() => setQrOpen(true)}>
									参加用 QR コード
								</button>
								<JoinQrModal gameId={gameId} isOpen={qrOpen} onClose={() => setQrOpen(false)} />
							</>
						);
					}}
				</GameScreen>
			)}
		</HostGate>
	);
};
