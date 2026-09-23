import {useParams} from 'react-router';
import {HostGate} from '../components/HostGate.tsx';
import {screens} from '../modes/registry.ts';
import {GameScreen, Unsupported} from './GameScreen.tsx';

export const HostPage = () => {
	const {gameId = ''} = useParams();
	return (
		<HostGate>
			{(password) => (
				<GameScreen request={{gameId, role: 'host', password}}>
					{(props) => {
						const Host = screens[props.view.game.mode].Host;
						return Host ? <Host {...props} /> : <Unsupported screen="司会者画面" />;
					}}
				</GameScreen>
			)}
		</HostGate>
	);
};
