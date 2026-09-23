import {type FormEvent, useState} from 'react';
import {Link} from 'react-router';
import {modes} from '../../shared/modes/registry.ts';
import type {ModeId} from '../../shared/types.ts';
import {HostGate} from '../components/HostGate.tsx';
import {useNotify, useRun} from '../components/Toast.tsx';
import {REQUEST_TIMEOUT_MS, socket, unwrap} from '../lib/socket.ts';
import {useGameList} from '../lib/useGameList.ts';
import styles from './Page.module.css';
import {GameLinks} from './TopPage.tsx';

const modeIds = Object.keys(modes) as ModeId[];

const Admin = ({password}: {password: string}) => {
	const games = useGameList();
	const run = useRun();
	const notify = useNotify();
	const [mode, setMode] = useState<ModeId>(modeIds[0] as ModeId);
	const [title, setTitle] = useState('');

	const onCreate = async (event: FormEvent) => {
		event.preventDefault();
		const created = await run(async () =>
			unwrap(
				await socket
					.timeout(REQUEST_TIMEOUT_MS)
					.emitWithAck('createGame', {mode, title: title.trim(), password}),
			),
		);
		if (created) {
			setTitle('');
			notify('ゲームを作成しました');
		}
	};

	const onDelete = async (gameId: string, gameTitle: string) => {
		if (!window.confirm(`「${gameTitle}」を削除しますか? この操作は取り消せません。`)) return;
		await run(async () =>
			unwrap(
				await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('deleteGame', {gameId, password}),
			),
		);
	};

	return (
		<main className={styles.page}>
			<header className={styles.header}>
				<h1>ゲームの管理</h1>
				<Link to="/">トップへ</Link>
			</header>
			<section className={styles.card}>
				<h2>新しいゲームを作る</h2>
				<form className={styles.row} onSubmit={onCreate}>
					<select value={mode} onChange={(event) => setMode(event.target.value as ModeId)}>
						{modeIds.map((id) => (
							<option key={id} value={id}>
								{modes[id].name}
							</option>
						))}
					</select>
					<input
						placeholder="タイトル (例: 1日目 早押しクイズ)"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						size={32}
					/>
					<button type="submit" disabled={title.trim() === ''}>
						作成
					</button>
				</form>
			</section>
			<section className={styles.card}>
				<h2>ゲーム一覧</h2>
				<ul className={styles.gameList}>
					{games?.map((game) => (
						<li key={game.id} className={styles.gameItem}>
							<div>
								<div className={styles.gameTitle}>{game.title}</div>
								<div className={styles.muted}>
									{modes[game.mode].name} ・ ID: {game.id} ・{' '}
									{new Date(game.createdAt).toLocaleString('ja-JP')}
								</div>
							</div>
							<div className={styles.row}>
								<GameLinks gameId={game.id} />
								<button type="button" onClick={() => onDelete(game.id, game.title)}>
									削除
								</button>
							</div>
						</li>
					))}
				</ul>
			</section>
		</main>
	);
};

export const AdminPage = () => <HostGate>{(password) => <Admin password={password} />}</HostGate>;
