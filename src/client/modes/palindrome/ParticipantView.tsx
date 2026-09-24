import {type FormEvent, useEffect, useMemo, useRef, useState} from 'react';
import {mediaUrl} from '../../../shared/media.ts';
import {
	computeQuestionPenalty,
	computeQuestionStandings,
	currentRecord,
	HINT_NAMES,
	HINT_PENALTIES,
	type HintKind,
} from '../../../shared/modes/palindrome/index.ts';
import type {
	PalindromeQuestionExtra,
	PalindromeState,
} from '../../../shared/modes/palindrome/types.ts';
import {getAnswerValidationError} from '../../../shared/modes/palindrome/validation.ts';
import {useNotify} from '../../components/Toast.tsx';
import type {ScreenProps} from '../types.ts';
import {
	findQuestion,
	formatPenalty,
	formatTime,
	isOpen,
	participantName,
	questionNumber,
} from './helpers.ts';
import styles from './ParticipantView.module.css';

const HINT_ORDER: HintKind[] = ['situation', 'irasutoya', 'charTypes'];

/** 経過時間表示バッジ (タイマー更新の再レンダリングを局所化) */
interface ElapsedTimeBadgeProps {
	openedAt?: number | null;
	closedAt?: number | null;
	correctAt?: number | null;
	isOpen: boolean;
	isCorrect: boolean;
}

const ElapsedTimeBadge = ({
	openedAt,
	closedAt,
	correctAt,
	isOpen,
	isCorrect,
}: ElapsedTimeBadgeProps) => {
	const [now, setNow] = useState(Date.now());

	useEffect(() => {
		if (!isOpen || isCorrect || !openedAt) return;
		const timer = setInterval(() => setNow(Date.now()), 100);
		return () => clearInterval(timer);
	}, [isOpen, isCorrect, openedAt]);

	const elapsedMs = useMemo(() => {
		if (!openedAt) return null;
		if (isCorrect && correctAt) {
			return correctAt - openedAt;
		}
		if (isOpen) {
			return Math.max(0, now - openedAt);
		}
		if (closedAt) {
			return closedAt - openedAt;
		}
		return null;
	}, [openedAt, isCorrect, correctAt, isOpen, closedAt, now]);

	return (
		<div className={styles.timerBadge}>{isOpen || isCorrect ? formatTime(elapsedMs) : '—'}</div>
	);
};

export const ParticipantView = ({view, send, participantId}: ScreenProps<PalindromeState>) => {
	const {game} = view;
	const {state} = game;
	const notify = useNotify();

	const [inputText, setInputText] = useState('');
	const [isLightboxOpen, setIsLightboxOpen] = useState(false);
	const isComposingRef = useRef(false);
	const justEndedCompositionRef = useRef(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const record = currentRecord(state);
	const question = record ? findQuestion(game, record.questionId) : undefined;
	const extra = (question?.extra ?? {}) as Partial<PalindromeQuestionExtra> & {
		charCount?: number;
	};

	const pRec = record && participantId ? record.participants[participantId] : undefined;
	const isCorrect = pRec?.correctAt !== null && pRec?.correctAt !== undefined;
	const wrongAnswers = useMemo(() => pRec?.wrong.map((w) => w.text) ?? [], [pRec?.wrong]);

	const charCount = extra.charCount ?? [...(question?.answer ?? '')].length;
	const currentOpen = isOpen(state);

	// 問題が切り替わったら入力欄と拡大状態をリセット
	// biome-ignore lint/correctness/useExhaustiveDependencies: 問題の切り替え時にのみリセット
	useEffect(() => {
		setInputText('');
		setIsLightboxOpen(false);
	}, [record?.questionId]);

	// 確定経過時間 (ms) の計算 (正解時のみ表示に使用。出題中のリアルタイムタイマーは ElapsedTimeBadge で局所管理)
	const resolvedElapsedMs = useMemo(() => {
		if (!record) return null;
		if (isCorrect && pRec?.correctAt) {
			return pRec.correctAt - record.openedAt;
		}
		if (record.closedAt) {
			return record.closedAt - record.openedAt;
		}
		return null;
	}, [record, isCorrect, pRec?.correctAt]);

	// 順位
	const myRank = useMemo(() => {
		if (!record) return null;
		const standings = computeQuestionStandings(record, game.participants);
		return standings.find((s) => s.participantId === participantId)?.rank ?? null;
	}, [record, game.participants, participantId]);

	// ペナルティ時間
	const penaltyMs = useMemo(() => (pRec ? computeQuestionPenalty(pRec.hints) : 0), [pRec]);

	// 記録時間 (正解時のみ)
	const recordTimeMs = useMemo(() => {
		if (!isCorrect || resolvedElapsedMs === null) return null;
		return resolvedElapsedMs + penaltyMs;
	}, [isCorrect, resolvedElapsedMs, penaltyMs]);

	// 入力中の文字のバリデーション
	const validationError = useMemo(() => {
		if (!inputText.trim() || !charCount) return null;
		return getAnswerValidationError(inputText, {
			answer: 'あ'.repeat(charCount),
			wrongAnswers,
		});
	}, [inputText, charCount, wrongAnswers]);

	const canSubmit =
		currentOpen && !isCorrect && inputText.trim() !== '' && validationError === null;

	const handleSubmit = async (event?: FormEvent) => {
		if (event) event.preventDefault();
		if (isComposingRef.current || justEndedCompositionRef.current) return;
		if (!canSubmit) return;

		try {
			await send({type: 'answer', text: inputText.trim()});
			setInputText('');
		} catch (error) {
			notify(error instanceof Error ? error.message : String(error), 'error');
		}
	};

	const handleOpenHint = async (kind: HintKind) => {
		if (!currentOpen || isCorrect) return;
		if (pRec?.hints[kind] !== undefined) return;

		const penaltySec = Math.round(HINT_PENALTIES[kind] / 1000);
		if (!window.confirm(`${penaltySec} 秒加算されます。開けますか?`)) {
			return;
		}

		try {
			await send({type: 'openHint', kind});
		} catch (error) {
			notify(error instanceof Error ? error.message : String(error), 'error');
		}
	};

	const qNum = questionNumber(state);
	const pName = participantId ? participantName(game, participantId) : '';

	// マス目に表示する文字の配列
	const gridChars = useMemo(() => {
		if (!charCount) return [];
		if (state.phase === 'closed' && question?.answer) {
			return [...question.answer];
		}
		const inputChars = [...inputText.replace(/\s+/g, '')];
		const result: string[] = [];
		for (let i = 0; i < charCount; i++) {
			result.push(inputChars[i] ?? '');
		}
		return result;
	}, [charCount, inputText, state.phase, question?.answer]);

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<div className={styles.titleGroup}>
					<span className={styles.gameTitle}>{game.title}</span>
					<span className={styles.participantName}>{pName}</span>
				</div>
				<ElapsedTimeBadge
					openedAt={record?.openedAt}
					closedAt={record?.closedAt}
					correctAt={pRec?.correctAt}
					isOpen={currentOpen}
					isCorrect={isCorrect}
				/>
			</header>

			<main className={styles.main}>
				{state.phase === 'waiting' && (
					<div className={styles.statusCard}>
						<div className={styles.statusMessage}>まもなく開始します</div>
					</div>
				)}

				{state.phase === 'finished' && (
					<div className={styles.statusCard}>
						<div className={styles.statusMessage}>全問終了しました！</div>
					</div>
				)}

				{(currentOpen || state.phase === 'closed') && question && (
					<>
						{/* 問題終了後の答え公開 */}
						{state.phase === 'closed' && (
							<div className={styles.answerRevealCard}>
								<div className={styles.answerRevealLabel}>正解</div>
								<div className={styles.answerRevealText}>{question.answer}</div>
								{extra.notation && (
									<div className={styles.answerRevealNotation}>({extra.notation})</div>
								)}
							</div>
						)}

						{/* 正解時の結果通知 */}
						{isCorrect && (
							<div className={styles.correctCard}>
								<div className={styles.correctTitle}>正解！</div>
								<div className={styles.correctDetails}>
									記録 {formatTime(recordTimeMs)}
									{penaltyMs > 0 && ` (ペナルティ ${formatPenalty(penaltyMs)})`}
									{myRank !== null && `、現在 ${myRank} 位`}
								</div>
								<div className={styles.correctSubDetails}>
									経過時間: {formatTime(resolvedElapsedMs)}
								</div>
							</div>
						)}

						{/* イラスト (タップで拡大) */}
						{extra.image && (
							<div className={styles.imageCard}>
								<button
									type="button"
									className={styles.imageButton}
									onClick={() => setIsLightboxOpen(true)}
									aria-label="イラストを拡大"
								>
									<img
										src={mediaUrl(extra.image)}
										alt={`第 ${qNum} 問 イラスト`}
										className={styles.image}
									/>
								</button>
								<span className={styles.imageHint}>タップで拡大</span>
							</div>
						)}

						{/* 文字数マス目 */}
						{charCount > 0 && (
							<div className={styles.gridCard}>
								<span className={styles.gridLabel}>文字数: {charCount} 文字</span>
								<div className={styles.charGrid}>
									{gridChars.map((char, index) => {
										const isFilled = char !== '';
										const isAnswer = state.phase === 'closed';
										return (
											<div
												// biome-ignore lint/suspicious/noArrayIndexKey: マス目の固定インデックス
												key={index}
												className={`${styles.charBox} ${
													isAnswer ? styles.charBoxAnswer : isFilled ? styles.charBoxFilled : ''
												}`}
											>
												{char}
											</div>
										);
									})}
								</div>
							</div>
						)}

						{/* 回答欄 (出題中かつ未正解時のみ表示) */}
						{currentOpen && !isCorrect && (
							<form className={styles.answerForm} onSubmit={handleSubmit}>
								<div className={styles.inputGroup}>
									<input
										ref={inputRef}
										type="text"
										className={styles.answerInput}
										value={inputText}
										onChange={(e) => setInputText(e.target.value)}
										onCompositionStart={() => {
											isComposingRef.current = true;
										}}
										onCompositionEnd={() => {
											isComposingRef.current = false;
											justEndedCompositionRef.current = true;
											setTimeout(() => {
												justEndedCompositionRef.current = false;
											}, 60);
										}}
										onKeyDown={(e) => {
											if (
												e.key === 'Enter' &&
												!isComposingRef.current &&
												!e.nativeEvent.isComposing &&
												!justEndedCompositionRef.current &&
												canSubmit
											) {
												e.preventDefault();
												handleSubmit();
											}
										}}
										placeholder="ひらがなで入力"
										enterKeyHint="send"
										autoCapitalize="none"
										autoComplete="off"
										autoCorrect="off"
										spellCheck={false}
									/>
									<button type="submit" className={styles.submitButton} disabled={!canSubmit}>
										送信
									</button>
								</div>
								{validationError && <div className={styles.validationError}>{validationError}</div>}
							</form>
						)}

						{/* ヒントセクション (出題中または終了後) */}
						<div className={styles.hintsSection}>
							<span className={styles.sectionTitle}>ヒント</span>
							{currentOpen && !isCorrect && (
								<div className={styles.hintButtons}>
									{HINT_ORDER.map((kind) => {
										const isOpened = pRec?.hints[kind] !== undefined;
										const penalty = HINT_PENALTIES[kind];
										return (
											<button
												key={kind}
												type="button"
												className={`${styles.hintButton} ${
													isOpened ? styles.hintButtonOpened : ''
												}`}
												onClick={() => handleOpenHint(kind)}
												disabled={isOpened}
											>
												<span>{HINT_NAMES[kind]}</span>
												<span className={styles.penaltyTag}>
													{isOpened ? '開放済み' : formatPenalty(penalty)}
												</span>
											</button>
										);
									})}
								</div>
							)}

							{/* 開けたヒントの本文一覧 */}
							<div className={styles.openedHintsList}>
								{HINT_ORDER.map((kind) => {
									const hintBody = extra.hints?.[kind];
									if (!hintBody) return null;
									return (
										<div key={kind} className={styles.openedHintCard}>
											<div className={styles.openedHintName}>
												{HINT_NAMES[kind]}ヒント ({formatPenalty(HINT_PENALTIES[kind])})
											</div>
											<div className={styles.openedHintBody}>{hintBody}</div>
										</div>
									);
								})}
							</div>
						</div>

						{/* 自分の誤答一覧 */}
						{pRec && pRec.wrong.length > 0 && (
							<div className={styles.wrongAnswersCard}>
								<span className={styles.sectionTitle}>誤答 ({pRec.wrong.length} 回)</span>
								<ul className={styles.wrongAnswersList}>
									{pRec.wrong.map((item, index) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: 誤答履歴
										<li key={index} className={styles.wrongAnswerItem}>
											{item.text}
										</li>
									))}
								</ul>
							</div>
						)}
					</>
				)}
			</main>

			{/* イラスト拡大ライトボックス */}
			{isLightboxOpen && extra.image && (
				<div
					className={styles.lightboxOverlay}
					onKeyDown={(e) => {
						if (e.key === 'Escape') setIsLightboxOpen(false);
					}}
					role="dialog"
					aria-modal="true"
					aria-label="イラスト拡大表示"
				>
					<button
						type="button"
						className={styles.lightboxBackdrop}
						onClick={() => setIsLightboxOpen(false)}
						aria-label="背景をクリックして閉じる"
					/>
					<div className={styles.lightboxContent}>
						<button
							type="button"
							className={styles.lightboxCloseButton}
							onClick={() => setIsLightboxOpen(false)}
							aria-label="閉じる"
						>
							✕
						</button>
						<img src={mediaUrl(extra.image)} alt="拡大イラスト" className={styles.lightboxImage} />
					</div>
				</div>
			)}
		</div>
	);
};
