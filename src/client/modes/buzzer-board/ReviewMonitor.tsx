import {
	type BuzzerBoardQuestionExtra,
	type BuzzerBoardState,
	describeResult,
} from '../../../shared/modes/buzzer-board/index.ts';
import type {ReviewMonitorProps} from '../types.ts';
import {
	findQuestion,
	participantName,
	questionFontSize,
	reviewStandings,
	scoreboardLayout,
} from './helpers.ts';
import styles from './ReviewMonitor.module.css';

export const ReviewMonitor = ({view, item, index, total}: ReviewMonitorProps<BuzzerBoardState>) => {
	const {game} = view;
	const {state} = game;
	const question = findQuestion(game, item.questionId);
	const record =
		state.history[item.recordIndex] ?? state.history.find((r) => r.questionId === item.questionId);

	const standingsList = record ? reviewStandings(game, record) : [];
	const layout = scoreboardLayout(standingsList.length, 730);

	const genre = record?.genre ?? (question?.extra as BuzzerBoardQuestionExtra | undefined)?.genre;
	const isBoard = Boolean(record?.board);

	const answeredBuzzes = record
		? record.buzzes.filter((b) => b.status === 'correct' || b.status === 'wrong')
		: [];

	const correctBuzz = record?.buzzes.find((b) => b.status === 'correct');
	const winnerName = correctBuzz ? participantName(game, correctBuzz.participantId) : null;

	const breakdown = record?.breakdown;
	const breakdownText = breakdown
		? breakdown.bonus > 0
			? `正解 +${breakdown.base} / 連答ボーナス +${breakdown.bonus}`
			: `正解 +${breakdown.base}`
		: null;

	const boardAnswersList = record?.board
		? Object.entries(record.board.answers).map(([participantId, ans]) => ({
				participantId,
				name: participantName(game, participantId),
				text: ans.submittedAt !== null && ans.text ? ans.text : '無回答',
				correct: ans.correct,
			}))
		: [];

	return (
		<div className={styles.stage}>
			<header className={styles.header}>
				<div className={styles.titleArea}>
					<span className={styles.badge}>感想戦</span>
					<span className={styles.title}>{game.title}</span>
				</div>
				<div className={styles.headline}>第 {index + 1} 問</div>
				<div className={styles.progress}>
					第 {index + 1} 問 / 全 {total} 問
				</div>
			</header>

			<main className={styles.main}>
				<div className={styles.left}>
					<section className={styles.panel}>
						<div className={styles.panelLabel}>問題と正解</div>
						{genre && <div className={styles.genreBadge}>{genre}</div>}
						<div
							className={styles.questionText}
							style={{fontSize: questionFontSize(question?.text ?? '')}}
						>
							{question?.text ?? '(問題が見つかりません)'}
						</div>
						<div className={styles.answerSection}>
							<span className={styles.answerLabel}>答え</span>
							<span className={styles.answerText}>{question?.answer ?? '—'}</span>
						</div>
					</section>

					<section className={styles.panel}>
						<div className={styles.panelLabel}>
							{isBoard ? '結果 & ボードクイズ回答' : '結果 & 早押し履歴'}
						</div>
						<div className={styles.resultRow}>
							{isBoard ? (
								<div className={styles.resultBadge} data-result="board">
									<span className={styles.resultLabel}>ボードクイズ</span>
								</div>
							) : record?.result ? (
								<div className={styles.resultBadge} data-result={record.result}>
									<span className={styles.resultLabel}>{describeResult(record.result)}</span>
									{winnerName && <span className={styles.winnerName}>({winnerName})</span>}
								</div>
							) : (
								<div className={styles.placeholder}>—</div>
							)}
							{breakdownText && <span className={styles.breakdownBadge}>{breakdownText}</span>}
						</div>

						{isBoard ? (
							boardAnswersList.length > 0 ? (
								<ul className={styles.boardList}>
									{boardAnswersList.map((item) => (
										<li
											key={item.participantId}
											className={styles.boardItem}
											data-correct={String(item.correct === true)}
										>
											<span className={styles.boardName}>{item.name}</span>
											<span className={styles.boardAnswer}>{item.text}</span>
											<span
												className={styles.boardMark}
												data-correct={String(item.correct === true)}
											>
												{item.correct === true ? '○' : '×'}
											</span>
											<span
												className={styles.boardDelta}
												data-delta={item.correct === true ? 'plus' : 'zero'}
											>
												{item.correct === true ? '+1' : '±0'}
											</span>
										</li>
									))}
								</ul>
							) : (
								<div className={styles.placeholderBuzz}>回答者はいませんでした</div>
							)
						) : answeredBuzzes.length > 0 ? (
							<ol className={styles.buzzes}>
								{answeredBuzzes.map((buzz, buzzIndex) => (
									<li key={buzz.participantId} data-status={buzz.status}>
										<span className={styles.buzzOrder}>{buzzIndex + 1}</span>
										<span className={styles.buzzName}>
											{participantName(game, buzz.participantId)}
										</span>
										<span className={styles.buzzMark}>{buzz.status === 'correct' ? '○' : '×'}</span>
										<span className={styles.buzzTime}>
											+{Math.max(0, (buzz.pressedAt - (record?.startedAt ?? 0)) / 1000).toFixed(2)}
											秒
										</span>
									</li>
								))}
							</ol>
						) : (
							<div className={styles.placeholderBuzz}>回答権を得た参加者はいませんでした</div>
						)}
					</section>
				</div>

				<section className={`${styles.panel} ${styles.scoreboard}`}>
					<div className={styles.panelLabel}>出題時の得点状況</div>
					<div className={styles.rankingHeader}>
						<span className={styles.rankCol}>順位</span>
						<span className={styles.nameCol}>参加者</span>
						<span className={styles.statusCol}>状態</span>
						<span className={styles.scoreCol}>得点</span>
						<span className={styles.deltaCol}>変動</span>
					</div>
					<ol
						className={styles.ranking}
						style={{
							gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
							gridTemplateRows: `repeat(${layout.rows}, ${layout.rowHeight}px)`,
							fontSize: Math.round(layout.rowHeight * 0.42),
						}}
					>
						{standingsList.map((standing) => (
							<li key={standing.participant.id}>
								<span className={styles.rank}>{standing.rank}</span>
								<span className={styles.rankName}>{standing.participant.name}</span>
								<span className={styles.rankTags}>
									{standing.cleared && <span className={styles.clearedTag}>勝抜</span>}
									{standing.streak > 0 && (
										<span className={styles.streakTag}>
											{standing.streak > 1 ? `${standing.streak}連答` : '連答中'}
										</span>
									)}
									{standing.rest > 0 && <span className={styles.restTag}>休{standing.rest}</span>}
								</span>
								<span className={styles.rankScore}>{standing.scoreBefore} pt</span>
								<span
									className={styles.rankDelta}
									data-delta={
										standing.scoreDelta > 0 ? 'plus' : standing.scoreDelta < 0 ? 'minus' : 'zero'
									}
								>
									{standing.scoreDelta > 0
										? `+${standing.scoreDelta}`
										: standing.scoreDelta < 0
											? `${standing.scoreDelta}`
											: '±0'}
								</span>
							</li>
						))}
					</ol>
				</section>
			</main>
		</div>
	);
};
