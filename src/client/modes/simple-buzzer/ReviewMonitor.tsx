import type {SimpleBuzzerState} from '../../../shared/modes/simple-buzzer/index.ts';
import type {ReviewMonitorProps} from '../types.ts';
import styles from './ReviewMonitor.module.css';

export const ReviewMonitor = ({
	view,
	item,
	index,
	total,
}: ReviewMonitorProps<SimpleBuzzerState>) => {
	const question = view.game.questions.find((q) => q.id === item.questionId);
	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<span className={styles.badge}>感想戦</span>
				<span className={styles.progress}>
					第 {index + 1} 問 / 全 {total} 問
				</span>
			</header>
			<main className={styles.main}>
				<div className={styles.questionCard}>
					<div className={styles.questionText}>{question?.text ?? '(問題が見つかりません)'}</div>
					<div className={styles.answerSection}>
						<span className={styles.answerLabel}>答え</span>
						<span className={styles.answerText}>{question?.answer ?? '—'}</span>
					</div>
				</div>
			</main>
		</div>
	);
};
