import {
	type BuzzerBoardState,
	currentRecord,
	describeResult,
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
	const layout = scoreboardLayout(ranking.length);
	const answering = record?.buzzes.find((b) => b.status === 'answering');
	const buzzes = record?.buzzes.filter((b) => b.status !== 'void') ?? [];
	const previous = previousRecord(state);
	const previousQuestion = previous ? findQuestion(game, previous.questionId) : undefined;
	const asked = state.history.filter((r) => r.result !== 'cancelled').length;
	const number = questionNumber(state);
	const winners = ranking.filter((s) => s.rank === 1);

	const headline = (() => {
		switch (state.phase) {
			case 'waiting':
				return 'まもなく開始';
			case 'finished':
				return '全問終了';
			default:
				return `第 ${number} 問`;
		}
	})();

	return (
		<div className={styles.stage}>
			<header className={styles.header}>
				<div className={styles.title}>{game.title}</div>
				<div className={styles.headline}>{headline}</div>
				<div className={styles.progress}>
					出題 {asked} / {questionCount} 問
				</div>
			</header>

			<main className={styles.main}>
				<div className={styles.left}>
					<section className={styles.panel} data-highlight={Boolean(answering)}>
						<div className={styles.panelLabel}>回答権</div>
						{record?.genre && <div className={styles.genreBadge}>{record.genre}</div>}
						{answering ? (
							<div className={styles.answeringName}>
								{participantName(game, answering.participantId)}
							</div>
						) : (
							<div className={styles.placeholder}>
								{state.phase === 'reading'
									? '問題読み上げ中'
									: record?.result
										? describeResult(record.result)
										: '—'}
							</div>
						)}
						{buzzes.length > 0 && (
							<ol className={styles.buzzes}>
								{buzzes.map((buzz, index) => (
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
					</section>

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
							fontSize: Math.round(layout.rowHeight * 0.45),
						}}
					>
						{ranking.map(({participant, score, rank, rest, cleared}) => (
							<li key={participant.id} data-answering={answering?.participantId === participant.id}>
								<span className={styles.rank}>{rank}</span>
								<span className={styles.rankName}>{participant.name}</span>
								<span className={styles.statusTags}>
									{cleared && <span className={styles.clearedTag}>勝抜</span>}
									{rest > 0 && <span className={styles.restTag}>休{rest}</span>}
								</span>
								<span className={styles.rankScore}>{score}</span>
							</li>
						))}
					</ol>
				</section>
			</main>

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
