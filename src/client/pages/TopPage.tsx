import {Link} from 'react-router';
import {modes} from '../../shared/modes/registry.ts';
import {useGameList} from '../lib/useGameList.ts';
import styles from './Page.module.css';

export const TopPage = () => {
	const games = useGameList();

	return (
		<main className={styles.page}>
			<header className={styles.header}>
				<h1>Summercamp Quiz</h1>
				<Link to="/admin">ゲームの管理</Link>
			</header>
			<section className={styles.card}>
				<h2>ゲーム一覧</h2>
				{games === null && <p className={styles.muted}>読み込み中…</p>}
				{games?.length === 0 && <p className={styles.muted}>ゲームがありません</p>}
				<ul className={styles.gameList}>
					{games?.map((game) => (
						<li key={game.id} className={styles.gameItem}>
							<div>
								<div className={styles.gameTitle}>{game.title}</div>
								<div className={styles.muted}>
									{modes[game.mode].name} ・ 参加者 {game.participantCount} 人 ・ 問題{' '}
									{game.questionCount} 問
								</div>
							</div>
							<GameLinks gameId={game.id} />
						</li>
					))}
				</ul>
			</section>
		</main>
	);
};

export const GameLinks = ({gameId}: {gameId: string}) => (
	<div className={styles.links}>
		<Link to={`/games/${gameId}/play`}>参加する</Link>
		<Link to={`/games/${gameId}/host`}>司会者</Link>
		<Link to={`/games/${gameId}/monitor`}>モニター</Link>
		<Link to={`/games/${gameId}/edit`}>問題編集</Link>
	</div>
);
