import {useParams} from 'react-router';
import {MonitorStage} from '../components/MonitorStage.tsx';
import {screens} from '../modes/registry.ts';
import {GameScreen, Unsupported} from './GameScreen.tsx';

export const MonitorPage = () => {
	const {gameId = ''} = useParams();
	return (
		<GameScreen request={{gameId, role: 'monitor'}}>
			{(props) => {
				const Monitor = screens[props.view.game.mode].Monitor;
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
