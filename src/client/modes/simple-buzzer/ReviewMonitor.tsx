import {describeResult, type SimpleBuzzerState} from '../../../shared/modes/simple-buzzer/index.ts';
import type {ReviewMonitorProps} from '../types.ts';
import {
	findQuestion,
	participantName,
	questionFontSize,
	reviewStandings,
	scoreboardLayout,
} from './helpers.ts';
import styles from './ReviewMonitor.module.css';

export const ReviewMonitor = ({
	view,
	item,
	index,
	total,
}: ReviewMonitorProps<SimpleBuzzerState>) => {
	const {game} = view;
	const {state} = game;
	const question = findQuestion(game, item.questionId);
	const record =
		state.history[item.recordIndex] ?? state.history.find((r) => r.questionId === item.questionId);

	const standingsList = record ? reviewStandings(game, record) : [];
	const layout = scoreboardLayout(standingsList.length, 760);

	const answeredBuzzes = record
		? record.buzzes.filter((b) => b.status === 'correct' || b.status === 'wrong')
		: [];

	const correctBuzz = record?.buzzes.find((b) => b.status === 'correct');
	const winnerName = correctBuzz ? participantName(game, correctBuzz.participantId) : null;

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
						<div className={styles.panelLabel}>結果 & 早押し履歴</div>
						<div className={styles.resultRow}>
							{record?.result ? (
								<div className={styles.resultBadge} data-result={record.result}>
									<span className={styles.resultLabel}>{describeResult(record.result)}</span>
									{winnerName && <span className={styles.winnerName}>({winnerName})</span>}
								</div>
							) : (
								<div className={styles.placeholder}>—</div>
							)}
						</div>
						{answeredBuzzes.length > 0 ? (
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
						<span className={styles.scoreCol}>得点</span>
						<span className={styles.deltaCol}>変動</span>
					</div>
					<ol
						className={styles.ranking}
						style={{
							gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
							gridTemplateRows: `repeat(${layout.rows}, ${layout.rowHeight}px)`,
							fontSize: Math.round(layout.rowHeight * 0.4),
						}}
					>
						{standingsList.map((standing) => (
							<li key={standing.participant.id}>
								<span className={styles.rank}>{standing.rank}</span>
								<span className={styles.rankName}>{standing.participant.name}</span>
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
