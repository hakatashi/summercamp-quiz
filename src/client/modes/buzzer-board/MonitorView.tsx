import {
	type BuzzerBoardState,
	currentRecord,
	describeResult,
	GENRES,
} from '../../../shared/modes/buzzer-board/index.ts';
import type {ScreenProps} from '../types.ts';
import {
	findQuestion,
	isOpen,
	participantName,
	previousRecord,
	questionFontSize,
	questionNumber,
	scoreboardLayout,
	standings,
} from './helpers.ts';
import styles from './MonitorView.module.css';

const markOf = {correct: '○', wrong: '×', answering: '', waiting: '', void: ''} as const;

export const MonitorView = ({view}: ScreenProps<BuzzerBoardState>) => {
	const {game, questionCount} = view;
	const {state} = game;
	const record = currentRecord(state);
	const ranking = standings(game);
	const layout = scoreboardLayout(ranking.length, 710);
	const answering = record?.buzzes.find((b) => b.status === 'answering');
	const buzzes = record?.buzzes.filter((b) => b.status !== 'void') ?? [];
	const secondaryBuzzes = answering
		? buzzes.filter((b) => b.participantId !== answering.participantId)
		: buzzes;

	const previous = previousRecord(state);
	const previousQuestion = previous ? findQuestion(game, previous.questionId) : undefined;
	const asked = state.history.filter((r) => r.result !== 'cancelled').length;
	const number = questionNumber(state);
	const winners = ranking.filter((s) => s.rank === 1);

	const isBoard = state.phase.startsWith('board-');
	const isClosedBoard = state.phase === 'closed' && Boolean(record?.board);
	const clearedParticipants = game.participants.filter((p) => state.cleared[p.id]);
	const boardAnswers = record?.board?.answers ?? {};
	const submittedCount = clearedParticipants.filter(
		(p) => boardAnswers[p.id]?.submittedAt !== null,
	).length;

	const chooserText = state.genreChooser
		? `${participantName(game, state.genreChooser)} が選択中`
		: state.nextGenre.chosenBy
			? `${participantName(game, state.nextGenre.chosenBy)} が選択`
			: '自動選択';

	const headline = (() => {
		switch (state.phase) {
			case 'waiting':
				return 'まもなく開始';
			case 'finished':
				return '全問終了';
			case 'board-answering':
			case 'board-judging':
				return `第 ${number} 問 (ボード)`;
			default:
				return `第 ${number} 問`;
		}
	})();

	return (
		<div className={styles.stage}>
			<header className={styles.header}>
				<div className={styles.titleArea}>
					<div className={styles.title}>{game.title}</div>
				</div>
				<div className={styles.headerCenter}>
					<div className={styles.headline}>{headline}</div>
					<div className={styles.genreInfo}>
						{record?.genre ? (
							<>
								<span className={styles.genreBadge}>ジャンル: {record.genre}</span>
								<span className={styles.nextGenreSub}>
									(次: {state.nextGenre.genre} ・ {chooserText})
								</span>
							</>
						) : (
							<span className={styles.nextGenreBadge}>
								次のジャンル: {state.nextGenre.genre} ({chooserText})
							</span>
						)}
					</div>
				</div>
				<div className={styles.progress}>
					出題 {asked} / {questionCount} 問
				</div>
			</header>

			<main className={styles.main}>
				<div className={styles.left}>
					{isBoard || isClosedBoard ? (
						<section className={styles.panel}>
							<div className={styles.panelLabel}>
								{record?.board?.confirmedAt !== null ? 'ボードクイズ結果' : 'ボードクイズ'}
							</div>
							{record?.genre && <div className={styles.panelGenreBadge}>{record.genre}</div>}
							<div className={styles.boardPanelContent}>
								{record?.board?.confirmedAt !== null ? (
									<ul
										className={styles.boardConfirmedList}
										data-compact={clearedParticipants.length > 8}
									>
										{clearedParticipants.map((p) => {
											const ans = boardAnswers[p.id];
											const text =
												ans && ans.submittedAt !== null && ans.text ? ans.text : '無回答';
											const isCorrect = ans?.correct === true;
											return (
												<li
													key={p.id}
													className={styles.boardConfirmedItem}
													data-correct={String(isCorrect)}
												>
													<span className={styles.boardMonitorItemName}>{p.name}</span>
													<span className={styles.boardConfirmedAnswer}>{text}</span>
													<span
														className={styles.boardConfirmedMark}
														data-correct={String(isCorrect)}
													>
														{isCorrect ? '○' : '×'}
													</span>
												</li>
											);
										})}
									</ul>
								) : (
									<>
										<div className={styles.boardMonitorHeadline}>
											{state.phase === 'board-answering' ? '回答受付中' : '判定中'}
										</div>
										<div className={styles.boardMonitorSub}>
											回答済み: {submittedCount} / {clearedParticipants.length} 人
										</div>
										<ul
											className={styles.boardMonitorList}
											data-compact={clearedParticipants.length > 12}
										>
											{clearedParticipants.map((p) => {
												const hasSubmitted = boardAnswers[p.id]?.submittedAt !== null;
												return (
													<li key={p.id} className={styles.boardMonitorItem}>
														<span className={styles.boardMonitorItemName}>{p.name}</span>
														<span className={styles.boardMonitorItemStatus}>
															{hasSubmitted ? '回答済' : '未回答'}
														</span>
													</li>
												);
											})}
										</ul>
									</>
								)}
							</div>
						</section>
					) : (
						<section className={styles.panel} data-highlight={Boolean(answering)}>
							<div className={styles.panelLabel}>回答権</div>
							{record?.genre && <div className={styles.panelGenreBadge}>{record.genre}</div>}
							{answering ? (
								<div className={styles.answeringSection}>
									<div className={styles.answeringName}>
										{participantName(game, answering.participantId)}
									</div>
									{secondaryBuzzes.length > 0 && (
										<div className={styles.secondarySection}>
											<span className={styles.secondaryLabel}>着順:</span>
											<ol className={styles.secondaryBuzzes}>
												{secondaryBuzzes.map((buzz, index) => (
													<li key={buzz.participantId} data-status={buzz.status}>
														<span className={styles.secondaryOrder}>{index + 2}</span>
														<span className={styles.secondaryName}>
															{participantName(game, buzz.participantId)}
														</span>
														{markOf[buzz.status] && (
															<span className={styles.secondaryMark}>{markOf[buzz.status]}</span>
														)}
													</li>
												))}
											</ol>
										</div>
									)}
								</div>
							) : (
								<div className={styles.placeholderSection}>
									<div className={styles.placeholder}>
										{state.phase === 'reading'
											? '問題読み上げ中'
											: record?.result
												? describeResult(record.result)
												: '—'}
									</div>
									{secondaryBuzzes.length > 0 && (
										<ol className={styles.buzzes}>
											{secondaryBuzzes.map((buzz, index) => (
												<li key={buzz.participantId} data-status={buzz.status}>
													<span className={styles.buzzOrder}>{index + 1}</span>
													<span className={styles.buzzName}>
														{participantName(game, buzz.participantId)}
													</span>
													<span className={styles.buzzMark}>{markOf[buzz.status]}</span>
												</li>
											))}
										</ol>
									)}
								</div>
							)}
						</section>
					)}

					<section className={styles.panel}>
						<div className={styles.panelLabel}>
							前の問題{previous && ` (第 ${state.history.indexOf(previous) + 1} 問)`}
						</div>
						{previousQuestion && !(isOpen(state) && previous === record) ? (
							<>
								<p
									className={styles.previousText}
									style={{fontSize: questionFontSize(previousQuestion.text)}}
								>
									{previousQuestion.text}
								</p>
								<p className={styles.previousAnswer}>
									<span className={styles.answerLabel}>A.</span>
									{previousQuestion.answer}
								</p>
							</>
						) : (
							<div className={styles.placeholder}>—</div>
						)}
					</section>
				</div>

				<section className={`${styles.panel} ${styles.scoreboard}`}>
					<div className={styles.panelLabel}>得点表</div>
					<ol
						className={styles.ranking}
						style={{
							gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
							gridTemplateRows: `repeat(${layout.rows}, ${layout.rowHeight}px)`,
							fontSize: Math.round(layout.rowHeight * 0.44),
						}}
					>
						{ranking.map(({participant, score, rank, rest, cleared, streak}) => (
							<li
								key={participant.id}
								data-answering={answering?.participantId === participant.id}
								style={{
									padding: layout.rowHeight < 45 ? '2px 8px' : '4px 12px',
								}}
							>
								<span className={styles.rank}>{rank}</span>
								<span className={styles.rankName}>{participant.name}</span>
								<span className={styles.statusTags}>
									{cleared && <span className={styles.clearedTag}>勝抜</span>}
									{streak > 0 && (
										<span className={styles.streakTag}>
											{streak > 1 ? `${streak}連答` : '連答中'}
										</span>
									)}
									{rest > 0 && <span className={styles.restTag}>休{rest}</span>}
								</span>
								<span className={styles.rankScore}>{score}</span>
							</li>
						))}
					</ol>
				</section>
			</main>

			<footer className={styles.genresFooter}>
				{GENRES.map((genre) => {
					const count = state.unaskedCounts?.[genre] ?? 0;
					const isCurrent = record ? record.genre === genre : state.nextGenre.genre === genre;
					return (
						<div
							key={genre}
							className={styles.genreCard}
							data-empty={count === 0}
							data-current={isCurrent}
						>
							<span className={styles.genreName}>{genre}</span>
							<span className={styles.genreCount}>{count}</span>
						</div>
					);
				})}
			</footer>

			{state.phase === 'finished' && winners.length > 0 && (
				<div className={styles.overlay}>
					<div className={styles.overlayLabel}>優勝</div>
					<div className={styles.overlayName}>
						{winners.map((w) => w.participant.name).join('・')}
					</div>
					<div className={styles.overlayScore}>{winners[0]?.score} pt</div>
				</div>
			)}
		</div>
	);
};
