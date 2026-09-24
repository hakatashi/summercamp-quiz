import {useParams} from 'react-router';
import {getMode} from '../../shared/modes/registry.ts';
import {HostGate} from '../components/HostGate.tsx';
import {MonitorStage} from '../components/MonitorStage.tsx';
import {useGameList} from '../lib/useGameList.ts';
import {screens} from '../modes/registry.ts';
import {GameScreen, Unsupported} from './GameScreen.tsx';
import styles from './Page.module.css';

const MonitorScreen = ({gameId, password}: {gameId: string; password?: string}) => (
	<GameScreen request={{gameId, role: 'monitor', password}}>
		{(props) => {
			const modeScreens = screens[props.view.game.mode];
			const {review} = props.view.game;
			if (review !== null && modeScreens.ReviewMonitor) {
				const modeDef = getMode(props.view.game.mode);
				const items = modeDef.reviewItems?.(props.view.game) ?? [];
				const item = items[review.index];
				if (item) {
					const ReviewMonitor = modeScreens.ReviewMonitor;
					return (
						<MonitorStage>
							<ReviewMonitor {...props} item={item} index={review.index} total={items.length} />
						</MonitorStage>
					);
				}
			}
			const Monitor = modeScreens.Monitor;
			return Monitor ? (
				<MonitorStage>
					<Monitor {...props} />
				</MonitorStage>
			) : (
				<Unsupported screen="モニター画面" />
			);
		}}
	</GameScreen>
);

export const MonitorPage = () => {
	const {gameId = ''} = useParams();
	// モニターから操作する企画では司会者パスワードが要る。どの企画かは購読前に一覧から調べる
	const games = useGameList();
	if (games === null) {
		return (
			<div className={styles.center}>
				<p className={styles.muted}>読み込み中…</p>
			</div>
		);
	}
	const summary = games.find((game) => game.id === gameId);
	if (summary && getMode(summary.mode).monitorRequiresHost) {
		return (
			<HostGate>{(password) => <MonitorScreen gameId={gameId} password={password} />}</HostGate>
		);
	}
	return <MonitorScreen gameId={gameId} />;
};
