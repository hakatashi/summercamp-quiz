import {useParams} from 'react-router';
import {getMode} from '../../shared/modes/registry.ts';
import {MonitorStage} from '../components/MonitorStage.tsx';
import {screens} from '../modes/registry.ts';
import {GameScreen, Unsupported} from './GameScreen.tsx';

export const MonitorPage = () => {
	const {gameId = ''} = useParams();
	return (
		<GameScreen request={{gameId, role: 'monitor'}}>
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
};
