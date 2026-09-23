import {type FormEvent, useState} from 'react';
import {useParams} from 'react-router';
import {useRun} from '../components/Toast.tsx';
import {REQUEST_TIMEOUT_MS, socket, unwrap} from '../lib/socket.ts';
import {storage} from '../lib/storage.ts';
import {screens} from '../modes/registry.ts';
import {GameScreen, Unsupported} from './GameScreen.tsx';
import styles from './PlayPage.module.css';

const JoinForm = ({gameId, onJoined}: {gameId: string; onJoined: (token: string) => void}) => {
	const [name, setName] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const run = useRun();

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setSubmitting(true);
		const joined = await run(async () =>
			unwrap(
				await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('join', {gameId, name: name.trim()}),
			),
		);
		setSubmitting(false);
		if (joined) {
			storage.setToken(gameId, joined.token);
			onJoined(joined.token);
		}
	};

	return (
		<div className={styles.container}>
			<form className={styles.form} onSubmit={onSubmit}>
				<h1>参加登録</h1>
				<p>画面に表示される名前を入力してください。</p>
				<input
					value={name}
					onChange={(event) => setName(event.target.value)}
					maxLength={20}
					placeholder="名前"
					autoFocus
					enterKeyHint="done"
				/>
				<button type="submit" disabled={submitting || name.trim() === ''}>
					参加する
				</button>
			</form>
		</div>
	);
};

/** 参加登録をやり直せば解決するエラー */
const REGISTRATION_ERRORS = ['参加登録が必要です', '参加者から削除されました'];

export const PlayPage = () => {
	const {gameId = ''} = useParams();
	const [token, setToken] = useState(() => storage.getToken(gameId));

	if (!token) {
		return <JoinForm gameId={gameId} onJoined={setToken} />;
	}

	return (
		<GameScreen
			request={{gameId, role: 'participant', token}}
			renderError={(error) => (
				<div className={styles.container}>
					<div className={styles.form}>
						<p>{error}</p>
						{REGISTRATION_ERRORS.includes(error) ? (
							<button
								type="button"
								onClick={() => {
									storage.setToken(gameId, null);
									setToken(null);
								}}
							>
								参加登録をやり直す
							</button>
						) : (
							<button type="button" onClick={() => window.location.reload()}>
								再読み込み
							</button>
						)}
					</div>
				</div>
			)}
		>
			{(props) => {
				if (props.view.game.review !== null) {
					return (
						<div className={styles.container}>
							<div className={styles.form}>
								<h1>感想戦中</h1>
								<p>現在、感想戦を行っています。</p>
							</div>
						</div>
					);
				}
				const Participant = screens[props.view.game.mode].Participant;
				return Participant ? <Participant {...props} /> : <Unsupported screen="参加者画面" />;
			}}
		</GameScreen>
	);
};
