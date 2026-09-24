import {useMemo} from 'react';
import {mediaUrl} from '../../../shared/media.ts';
import {
	computeOverallStandings,
	computeQuestionStandings,
	currentRecord,
	HINT_NAMES,
} from '../../../shared/modes/palindrome/index.ts';
import type {
	PalindromeQuestionExtra,
	PalindromeState,
} from '../../../shared/modes/palindrome/types.ts';
import type {ScreenProps} from '../types.ts';
import {findQuestion, formatPenalty, formatTime, isOpen, questionNumber} from './helpers.ts';
import styles from './MonitorView.module.css';

export const MonitorView = ({view}: ScreenProps<PalindromeState>) => {
	const {game, questionCount} = view;
	const {state} = game;

	const record = currentRecord(state);
	const question = record ? findQuestion(game, record.questionId) : undefined;
	const extra = (question?.extra ?? {}) as Partial<PalindromeQuestionExtra> & {
		charCount?: number;
	};

	const charCount = extra.charCount ?? [...(question?.answer ?? '')].length;
	const open = isOpen(state);
	const qNum = questionNumber(state);

	// この問題の順位
	const questionStandings = useMemo(() => {
		if (!record) return [];
		return computeQuestionStandings(record, game.participants);
	}, [record, game.participants]);

	// 総合順位
	const overallStandings = useMemo(() => {
		return computeOverallStandings(state.history, game.participants);
	}, [state.history, game.participants]);

	// 参加者数に応じた列数設定
	const questionColumns = useMemo(() => {
		const count = questionStandings.length;
		if (count <= 12) return 1;
		if (count <= 24) return 2;
		return 3;
	}, [questionStandings.length]);

	const overallColumns = useMemo(() => {
		const count = overallStandings.length;
		if (count <= 12) return 1;
		if (count <= 24) return 2;
		return 3;
	}, [overallStandings.length]);

	const isQuestionDense = questionStandings.length > 18;
	const isOverallDense = overallStandings.length > 18;

	const rankBadgeClass = (rank: number) => {
		if (rank === 1) return styles.rankBadgeGold;
		if (rank === 2) return styles.rankBadgeSilver;
		if (rank === 3) return styles.rankBadgeBronze;
		return '';
	};

	const showStandingsView = state.showStandings || state.phase === 'finished';

	const headline = (() => {
		if (showStandingsView) return '総合順位';
		if (state.phase === 'waiting') return 'まもなく開始';
		return `第 ${qNum} 問`;
	})();

	return (
		<div className={styles.stage}>
			<header className={styles.header}>
				<div className={styles.title}>{game.title}</div>
				<div className={styles.headline}>{headline}</div>
				<div className={styles.progress}>
					{state.phase === 'waiting'
						? `全 ${questionCount} 問`
						: `出題 ${state.history.length} / ${questionCount} 問`}
				</div>
			</header>

			{/* 総合順位モード */}
			{showStandingsView ? (
				<main className={styles.standingsContainer}>
					<div className={styles.standingsHeader}>
						<div className={styles.standingsTitle}>総合順位結果</div>
						<div className={styles.rankingSummary}>参加者 {game.participants.length} 名</div>
					</div>

					<div
						className={styles.standingsGrid}
						data-dense={isOverallDense}
						style={{gridTemplateColumns: `repeat(${overallColumns}, 1fr)`}}
					>
						{overallStandings.map((s) => {
							const p = game.participants.find((item) => item.id === s.participantId);
							return (
								<div key={s.participantId} className={styles.standingCard}>
									<div className={styles.itemLeft}>
										<div className={`${styles.rankBadge} ${rankBadgeClass(s.rank)}`}>{s.rank}</div>
										<div className={styles.participantName}>
											{p?.name ?? '?'}
											{p?.kind === 'ai' && <span className={styles.aiBadge}>AI</span>}
										</div>
									</div>

									<div className={styles.standingStats}>
										<span className={styles.correctCount}>{s.correctCount} 問正解</span>
										<span className={styles.totalTime}>{formatTime(s.totalRecordTimeMs)}</span>
										{s.totalWrongCount > 0 && (
											<span className={styles.wrongCount}>(誤答 {s.totalWrongCount})</span>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</main>
			) : state.phase === 'waiting' ? (
				<main className={styles.waitingContainer}>
					<div className={styles.waitingMessage}>まもなく開始します</div>
					<div className={styles.waitingParticipants}>参加者: {game.participants.length} 名</div>
				</main>
			) : (
				/* 出題・結果画面 */
				<main className={styles.main}>
					{/* 左ペイン: 問題 */}
					<section className={styles.questionPane}>
						{extra.image ? (
							<div className={styles.imageBox}>
								<img src={mediaUrl(extra.image)} alt="回文イラスト" className={styles.image} />
							</div>
						) : (
							<div className={styles.imageBox}>
								<div className={styles.imagePlaceholder}>(イラスト出題中)</div>
							</div>
						)}

						{/* 問題終了時の答え公開 */}
						{state.phase === 'closed' && question && (
							<div className={styles.answerReveal}>
								<div className={styles.answerRevealText}>{question.answer}</div>
								{extra.notation && (
									<div className={styles.answerRevealNotation}>({extra.notation})</div>
								)}
							</div>
						)}

						{/* 文字数マス目 */}
						{charCount > 0 && (
							<div className={styles.charGrid}>
								{Array.from({length: charCount}).map((_, i) => {
									const answerChar =
										state.phase === 'closed' && question?.answer
											? ([...question.answer][i] ?? '')
											: '';
									return (
										<div
											// biome-ignore lint/suspicious/noArrayIndexKey: マス目の固定配列
											key={i}
											className={`${styles.charBox} ${answerChar ? styles.charBoxRevealed : ''}`}
										>
											{answerChar}
										</div>
									);
								})}
							</div>
						)}
					</section>

					{/* 右ペイン: 参加者順位・状況 */}
					<section className={styles.rankingPane}>
						<div className={styles.rankingHeader}>
							<div className={styles.rankingTitle}>回答状況</div>
							<div className={styles.rankingSummary}>
								正解 {questionStandings.filter((s) => s.correct).length} /{' '}
								{game.participants.length} 人
							</div>
						</div>

						<div
							className={styles.rankingGrid}
							data-dense={isQuestionDense}
							style={{gridTemplateColumns: `repeat(${questionColumns}, 1fr)`}}
						>
							{questionStandings.map((s) => {
								const p = game.participants.find((item) => item.id === s.participantId);
								return (
									<div
										key={s.participantId}
										className={`${styles.rankingItem} ${
											s.correct ? styles.rankingItemCorrect : ''
										}`}
									>
										<div className={styles.itemLeft}>
											<div
												className={`${styles.rankBadge} ${s.correct ? rankBadgeClass(s.rank) : ''}`}
											>
												{s.correct ? s.rank : '—'}
											</div>
											<div className={styles.participantName}>
												{p?.name ?? '?'}
												{p?.kind === 'ai' && <span className={styles.aiBadge}>AI</span>}
											</div>
										</div>

										<div className={styles.itemRight}>
											{s.correct ? (
												<>
													<span className={styles.recordTime}>{formatTime(s.recordTimeMs)}</span>
													<span className={styles.penaltyBreakdown}>
														({formatTime(s.elapsedMs)}
														{s.penaltyMs > 0 && ` ${formatPenalty(s.penaltyMs)}`})
													</span>
												</>
											) : (
												<>
													{s.openedHints.length > 0 && (
														<div className={styles.hintIcons}>
															{s.openedHints.map((kind) => (
																<span
																	key={kind}
																	className={styles.hintIcon}
																	title={HINT_NAMES[kind]}
																>
																	{HINT_NAMES[kind]}
																</span>
															))}
														</div>
													)}
													<span className={styles.statusPlaying}>{open ? '回答中' : '未正解'}</span>
												</>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</section>
				</main>
			)}
		</div>
	);
};
