import {useEffect, useMemo, useState} from 'react';
import {computeStandings, type PalindromeState} from '../../../shared/modes/palindrome/index.ts';
import type {ScreenProps} from '../types.ts';
import {useContestClock} from './contestClock.ts';
import {formatClock} from './helpers.ts';
import styles from './MonitorView.module.css';
import {Scoreboard} from './Scoreboard.tsx';

/** 1 ページに並べる参加者の数。これを超えたらページを自動で送る */
export const ROWS_PER_PAGE = 12;
const PAGE_INTERVAL_MS = 8000;

export const MonitorView = ({view}: ScreenProps<PalindromeState>) => {
	const {game, questionCount} = view;
	const {state} = game;
	const clock = useContestClock(state);

	const standings = useMemo(
		() => computeStandings(state, game.participants),
		[state, game.participants],
	);
	const pageCount = Math.max(1, Math.ceil(standings.length / ROWS_PER_PAGE));
	const [page, setPage] = useState(0);

	useEffect(() => {
		if (pageCount <= 1) return;
		const timer = setInterval(() => setPage((p) => (p + 1) % pageCount), PAGE_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [pageCount]);

	const currentPage = page % pageCount;
	const rows = standings.slice(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE);

	if (state.phase === 'waiting') {
		return (
			<div className={styles.stage}>
				<div className={styles.waiting}>
					<div className={styles.waitingTitle}>{game.title}</div>
					<div className={styles.waitingMode}>イラスト回文クイズ</div>
					<div className={styles.waitingInfo}>
						全 {questionCount} 問 ・ 制限時間 {Math.round(state.durationMs / 60_000)} 分
					</div>
					<div className={styles.waitingMessage}>まもなく開始します</div>
				</div>
			</div>
		);
	}

	const lowTime = clock.accepting && clock.remainingMs < 60_000;

	return (
		<div className={styles.stage}>
			<header className={styles.header}>
				<div className={styles.title}>{game.title}</div>
				<div className={styles.clock} data-low={lowTime ? 'true' : undefined}>
					{clock.over ? (
						<span className={styles.clockOver}>終了</span>
					) : (
						<>
							<span className={styles.clockLabel}>残り</span>
							{formatClock(clock.remainingMs)}
						</>
					)}
				</div>
				<div className={styles.info}>
					<span>
						{game.participants.length} 人 ・ {state.questionIds.length} 問
					</span>
					{pageCount > 1 && (
						<span className={styles.page}>
							{currentPage + 1} / {pageCount} ページ
						</span>
					)}
				</div>
			</header>
			<main className={styles.board}>
				<Scoreboard game={game} standings={rows} variant="monitor" />
			</main>
		</div>
	);
};
