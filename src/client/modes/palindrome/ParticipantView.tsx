import {type FormEvent, useEffect, useMemo, useRef, useState} from 'react';
import {mediaUrl} from '../../../shared/media.ts';
import {
	computeQuestionPenalty,
	computeStandings,
	contestQuestions,
	getAnswerValidationError,
	HINT_KINDS,
	HINT_NAMES,
	HINT_PENALTIES,
	type HintKind,
	isRevealed,
	type PalindromeAttempt,
	type PalindromeState,
	questionLabel,
} from '../../../shared/modes/palindrome/index.ts';
import type {Question} from '../../../shared/types.ts';
import {useNotify} from '../../components/Toast.tsx';
import type {ScreenProps} from '../types.ts';
import {useContestClock} from './contestClock.ts';
import {formatClock, formatPenalty, participantName, questionView} from './helpers.ts';
import styles from './ParticipantView.module.css';
import {Scoreboard} from './Scoreboard.tsx';

const STANDINGS_TAB = '__standings__';

interface QuestionPanelProps {
	question: Question;
	label: string;
	attempt: PalindromeAttempt | undefined;
	startedAt: number;
	accepting: boolean;
	revealed: boolean;
	send: ScreenProps<PalindromeState>['send'];
}

/** 1問分の画面 (イラスト、マス目、回答欄、ヒント、誤答) */
const QuestionPanel = ({
	question,
	label,
	attempt,
	startedAt,
	accepting,
	revealed,
	send,
}: QuestionPanelProps) => {
	const notify = useNotify();
	const [inputText, setInputText] = useState('');
	const [isLightboxOpen, setIsLightboxOpen] = useState(false);
	const isComposingRef = useRef(false);
	const justEndedCompositionRef = useRef(false);

	const info = questionView(question);
	const isCorrect = attempt?.correctAt !== null && attempt?.correctAt !== undefined;
	const wrongAnswers = useMemo(() => attempt?.wrong.map((w) => w.text) ?? [], [attempt?.wrong]);
	const penaltyMs = attempt ? computeQuestionPenalty(attempt.hints) : 0;
	const canAct = accepting && !isCorrect;

	const validationError = useMemo(() => {
		if (!inputText.trim() || !info.charCount) return null;
		return getAnswerValidationError(inputText, {
			answer: 'あ'.repeat(info.charCount),
			wrongAnswers,
		});
	}, [inputText, info.charCount, wrongAnswers]);

	const canSubmit = canAct && inputText.trim() !== '' && validationError === null;

	const handleSubmit = async (event?: FormEvent) => {
		if (event) event.preventDefault();
		if (isComposingRef.current || justEndedCompositionRef.current) return;
		if (!canSubmit) return;
		try {
			await send({type: 'answer', questionId: question.id, text: inputText.trim()});
			setInputText('');
		} catch (error) {
			notify(error instanceof Error ? error.message : String(error), 'error');
		}
	};

	const handleOpenHint = async (kind: HintKind) => {
		if (!canAct || attempt?.hints[kind] !== undefined) return;
		const penaltySec = Math.round(HINT_PENALTIES[kind] / 1000);
		if (
			!window.confirm(
				`問題 ${label} の${HINT_NAMES[kind]}ヒントを開けますか?\n正解したときに ${penaltySec} 秒加算されます。`,
			)
		) {
			return;
		}
		try {
			await send({type: 'openHint', questionId: question.id, kind});
		} catch (error) {
			notify(error instanceof Error ? error.message : String(error), 'error');
		}
	};

	// マス目に表示する文字 (公開後は答え、それまでは入力中の文字)
	const gridChars = useMemo(() => {
		if (revealed && question.answer) return [...question.answer];
		const inputChars = [...inputText.replace(/\s+/g, '')];
		return Array.from({length: info.charCount}, (_, i) => inputChars[i] ?? '');
	}, [info.charCount, inputText, revealed, question.answer]);

	return (
		<>
			{revealed && question.answer && (
				<div className={styles.answerRevealCard}>
					<div className={styles.answerRevealLabel}>正解</div>
					<div className={styles.answerRevealText}>{question.answer}</div>
					{info.notation && <div className={styles.answerRevealNotation}>({info.notation})</div>}
				</div>
			)}

			{isCorrect && attempt?.correctAt != null && (
				<div className={styles.correctCard}>
					<div className={styles.correctTitle}>正解！</div>
					<div className={styles.correctDetails}>
						開始から {formatClock(attempt.correctAt - startedAt)}
						{penaltyMs > 0 && ` (ペナルティ ${formatPenalty(penaltyMs)})`}
					</div>
				</div>
			)}

			{info.image && (
				<div className={styles.imageCard}>
					<button
						type="button"
						className={styles.imageButton}
						onClick={() => setIsLightboxOpen(true)}
						aria-label="イラストを拡大"
					>
						<img
							src={mediaUrl(info.image)}
							alt={`問題 ${label} のイラスト`}
							className={styles.image}
						/>
					</button>
					<span className={styles.imageHint}>タップで拡大</span>
				</div>
			)}

			{info.charCount > 0 && (
				<div className={styles.gridCard}>
					<span className={styles.gridLabel}>文字数: {info.charCount} 文字</span>
					<div className={styles.charGrid}>
						{gridChars.map((char, index) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: マス目の固定インデックス
								key={index}
								className={`${styles.charBox} ${
									revealed ? styles.charBoxAnswer : char !== '' ? styles.charBoxFilled : ''
								}`}
							>
								{char}
							</div>
						))}
					</div>
				</div>
			)}

			{canAct && (
				<form className={styles.answerForm} onSubmit={handleSubmit}>
					<div className={styles.inputGroup}>
						<input
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
							aria-label={`問題 ${label} の回答`}
						/>
						<button type="submit" className={styles.submitButton} disabled={!canSubmit}>
							送信
						</button>
					</div>
					{validationError && <div className={styles.validationError}>{validationError}</div>}
				</form>
			)}

			<div className={styles.hintsSection}>
				<span className={styles.sectionTitle}>ヒント</span>
				{canAct && (
					<div className={styles.hintButtons}>
						{HINT_KINDS.map((kind) => {
							const isOpened = attempt?.hints[kind] !== undefined;
							return (
								<button
									key={kind}
									type="button"
									className={`${styles.hintButton} ${isOpened ? styles.hintButtonOpened : ''}`}
									onClick={() => handleOpenHint(kind)}
									disabled={isOpened}
								>
									<span>{HINT_NAMES[kind]}</span>
									<span className={styles.penaltyTag}>
										{isOpened ? '開放済み' : formatPenalty(HINT_PENALTIES[kind])}
									</span>
								</button>
							);
						})}
					</div>
				)}
				<div className={styles.openedHintsList}>
					{HINT_KINDS.map((kind) => {
						const body = info.hints[kind];
						if (!body) return null;
						return (
							<div key={kind} className={styles.openedHintCard}>
								<div className={styles.openedHintName}>
									{HINT_NAMES[kind]}ヒント ({formatPenalty(HINT_PENALTIES[kind])})
								</div>
								<div className={styles.openedHintBody}>{body}</div>
							</div>
						);
					})}
				</div>
			</div>

			{attempt && attempt.wrong.length > 0 && (
				<div className={styles.wrongAnswersCard}>
					<span className={styles.sectionTitle}>誤答 ({attempt.wrong.length} 回)</span>
					<ul className={styles.wrongAnswersList}>
						{attempt.wrong.map((item, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: 誤答履歴
							<li key={index} className={styles.wrongAnswerItem}>
								{item.text}
							</li>
						))}
					</ul>
				</div>
			)}

			{isLightboxOpen && info.image && (
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
						<img src={mediaUrl(info.image)} alt="拡大イラスト" className={styles.lightboxImage} />
					</div>
				</div>
			)}
		</>
	);
};

export const ParticipantView = ({view, send, participantId}: ScreenProps<PalindromeState>) => {
	const {game} = view;
	const {state} = game;
	const clock = useContestClock(state);
	const questions = contestQuestions(game);
	const revealed = isRevealed(game);

	const [selected, setSelected] = useState<string | null>(null);
	const firstId = questions[0]?.id ?? null;
	const selectedId =
		selected === STANDINGS_TAB || questions.some((q) => q.id === selected) ? selected : firstId;

	// 別の問題に移ったら画面の先頭に戻す
	useEffect(() => {
		if (selectedId !== null) window.scrollTo?.({top: 0});
	}, [selectedId]);

	const standings = useMemo(
		() => computeStandings(state, game.participants),
		[state, game.participants],
	);
	const mine = standings.find((s) => s.participantId === participantId);
	const selectedIndex = questions.findIndex((q) => q.id === selectedId);
	const selectedQuestion = questions[selectedIndex];
	const attemptOf = (questionId: string) =>
		participantId ? state.attempts[questionId]?.[participantId] : undefined;

	const pName = participantId ? participantName(game, participantId) : '';

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<div className={styles.titleGroup}>
					<span className={styles.gameTitle}>{game.title}</span>
					<span className={styles.participantName}>{pName}</span>
				</div>
				{state.phase !== 'waiting' && (
					<div className={styles.timerBadge} data-over={clock.over ? 'true' : undefined}>
						{clock.over ? '終了' : `残り ${formatClock(clock.remainingMs)}`}
					</div>
				)}
			</header>

			{state.phase === 'waiting' ? (
				<main className={styles.main}>
					<div className={styles.statusCard}>
						<div className={styles.statusMessage}>まもなく開始します</div>
						<div className={styles.statusSub}>
							制限時間 {Math.round(state.durationMs / 60_000)}{' '}
							分。開始と同時に全ての問題が公開されます。
						</div>
					</div>
				</main>
			) : (
				<>
					<nav className={styles.tabs} aria-label="問題の一覧">
						{questions.map((q, index) => {
							const attempt = attemptOf(q.id);
							const solved = attempt?.correctAt != null;
							const wrong = attempt?.wrong.length ?? 0;
							return (
								<button
									key={q.id}
									type="button"
									className={styles.tab}
									data-active={q.id === selectedId ? 'true' : undefined}
									data-status={solved ? 'solved' : wrong > 0 ? 'wrong' : undefined}
									onClick={() => setSelected(q.id)}
								>
									<span className={styles.tabLabel}>{questionLabel(index)}</span>
									<span className={styles.tabStatus}>
										{solved ? '✓' : wrong > 0 ? `−${wrong}` : ''}
									</span>
								</button>
							);
						})}
						<button
							type="button"
							className={`${styles.tab} ${styles.tabStandings}`}
							data-active={selectedId === STANDINGS_TAB ? 'true' : undefined}
							onClick={() => setSelected(STANDINGS_TAB)}
						>
							順位表
						</button>
					</nav>

					<main className={styles.main}>
						<div className={styles.summary}>
							<span>
								<strong>{mine?.solvedCount ?? 0}</strong> / {questions.length} 問正解
							</span>
							{mine && mine.solvedCount > 0 && (
								<span>
									現在 <strong>{mine.rank}</strong> 位 ・ {formatClock(mine.scoreTimeMs)}
								</span>
							)}
						</div>

						{clock.over && (
							<div className={styles.statusCard}>
								<div className={styles.statusMessage}>コンテストは終了しました</div>
								{!revealed && <div className={styles.statusSub}>結果発表をお待ちください</div>}
							</div>
						)}

						{selectedId === STANDINGS_TAB ? (
							<div className={styles.standingsCard}>
								<Scoreboard
									game={game}
									standings={standings}
									variant="page"
									highlightId={participantId}
								/>
							</div>
						) : (
							selectedQuestion && (
								<>
									<h2 className={styles.questionTitle}>問題 {questionLabel(selectedIndex)}</h2>
									<QuestionPanel
										key={selectedQuestion.id}
										question={selectedQuestion}
										label={questionLabel(selectedIndex)}
										attempt={attemptOf(selectedQuestion.id)}
										startedAt={state.startedAt ?? 0}
										accepting={clock.accepting}
										revealed={revealed}
										send={send}
									/>
								</>
							)
						)}
					</main>
				</>
			)}
		</div>
	);
};
