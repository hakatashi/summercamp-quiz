import {type FormEvent, useCallback, useEffect, useState} from 'react';
import {getMode} from '../../shared/modes/registry.ts';
import type {Game} from '../../shared/types.ts';
import styles from './ReviewControls.module.css';
import {useRun} from './Toast.tsx';

export interface ReviewControlsProps {
	game: Game;
	send: (command: {type: string} & Record<string, unknown>) => Promise<unknown>;
}

const isTypingTarget = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export const ReviewControls = ({game, send}: ReviewControlsProps) => {
	const run = useRun();
	const mode = getMode(game.mode);
	const items = mode.reviewItems?.(game) ?? [];
	const currentIndex = game.review?.index ?? 0;
	const total = items.length;

	const [jumpValue, setJumpValue] = useState(String(currentIndex + 1));

	useEffect(() => {
		setJumpValue(String(currentIndex + 1));
	}, [currentIndex]);

	const move = useCallback(
		(index: number) => {
			void run(() => send({type: 'review.move', index}));
		},
		[run, send],
	);

	const onEnd = () => {
		if (window.confirm('感想戦を終了して本戦に戻りますか?')) {
			void run(() => send({type: 'review.end'}));
		}
	};

	const onJump = (event: FormEvent) => {
		event.preventDefault();
		const parsed = Number.parseInt(jumpValue, 10);
		if (!Number.isNaN(parsed)) {
			move(parsed - 1);
		}
	};

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
			if (isTypingTarget(event.target)) return;
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				if (currentIndex > 0) move(currentIndex - 1);
			} else if (event.key === 'ArrowRight') {
				event.preventDefault();
				if (currentIndex < total - 1) move(currentIndex + 1);
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [currentIndex, total, move]);

	const currentItem = items[currentIndex];
	const currentQuestion = currentItem
		? game.questions.find((q) => q.id === currentItem.questionId)
		: undefined;

	return (
		<div className={styles.container}>
			<div className={styles.left}>
				<section className={styles.card}>
					<div className={styles.toolbar}>
						<div className={styles.navControls}>
							<span className={styles.progress}>
								第 {total > 0 ? currentIndex + 1 : 0} 問 / 全 {total} 問
							</span>
							<button
								type="button"
								onClick={() => move(currentIndex - 1)}
								disabled={currentIndex <= 0}
								title="前の問題へ (←キー)"
							>
								← 前へ
							</button>
							<button
								type="button"
								onClick={() => move(currentIndex + 1)}
								disabled={currentIndex >= total - 1}
								title="次の問題へ (→キー)"
							>
								次へ →
							</button>
							<form className={styles.jumpForm} onSubmit={onJump}>
								<span>第</span>
								<input
									type="number"
									min={1}
									max={total}
									value={jumpValue}
									onChange={(e) => setJumpValue(e.target.value)}
									className={styles.jumpInput}
									aria-label="問題番号"
								/>
								<span>問へ</span>
								<button type="submit" className={styles.jumpButton}>
									移動
								</button>
							</form>
						</div>
						<button type="button" className={styles.endButton} onClick={onEnd}>
							感想戦を終える
						</button>
					</div>
				</section>

				<section className={styles.card}>
					<h2>第 {currentIndex + 1} 問 (振り返り中)</h2>
					{currentQuestion ? (
						<>
							<p className={styles.questionText}>{currentQuestion.text}</p>
							<p className={styles.answer}>
								<span className={styles.answerLabel}>答え</span>
								{currentQuestion.answer}
							</p>
							{currentQuestion.note && <p className={styles.note}>{currentQuestion.note}</p>}
						</>
					) : (
						<p className={styles.muted}>問題が見つかりません</p>
					)}
				</section>
			</div>

			<div className={styles.right}>
				<section className={styles.card}>
					<h2>振り返り項目一覧 ({total}問)</h2>
					<ol className={styles.itemList}>
						{items.map((item, idx) => {
							const q = game.questions.find((question) => question.id === item.questionId);
							const text = q?.text ?? '(削除された問題)';
							return (
								<li key={`${item.questionId}-${item.recordIndex}`}>
									<button
										type="button"
										className={idx === currentIndex ? styles.itemActive : styles.item}
										onClick={() => move(idx)}
									>
										<span className={styles.itemNumber}>第 {idx + 1} 問</span>
										<span className={styles.itemText}>{text}</span>
									</button>
								</li>
							);
						})}
					</ol>
				</section>
			</div>
		</div>
	);
};
