import {type FormEvent, useMemo, useState} from 'react';
import {Link} from 'react-router';
import {mediaUrl} from '../../../shared/media.ts';
import {
	computeQuestionSummary,
	computeStandings,
	contestQuestions,
	HINT_KINDS,
	HINT_NAMES,
	MAX_DURATION_MINUTES,
	type PalindromeState,
	questionLabel,
} from '../../../shared/modes/palindrome/index.ts';
import type {Question} from '../../../shared/types.ts';
import {ReviewControls} from '../../components/ReviewControls.tsx';
import {useNotify, useRun} from '../../components/Toast.tsx';
import type {ScreenProps} from '../types.ts';
import {useContestClock} from './contestClock.ts';
import styles from './HostView.module.css';
import {formatClock, participantName, questionView} from './helpers.ts';
import {HintIcons, Scoreboard} from './Scoreboard.tsx';

type Game = ScreenProps<PalindromeState>['view']['game'];

/** 1問分の答え・ヒント・正解状況 */
const QuestionCard = ({game, question, index}: {game: Game; question: Question; index: number}) => {
	const info = questionView(question);
	const {state} = game;
	const summary = computeQuestionSummary(state, question.id, game.participants);
	const firsts = new Set(summary.firstSolverIds);
	const wrongs = game.participants.flatMap((p) => {
		const wrong = state.attempts[question.id]?.[p.id]?.wrong ?? [];
		return wrong.length > 0 ? [{participantId: p.id, texts: wrong.map((w) => w.text)}] : [];
	});

	return (
		<section className={styles.questionCard}>
			<div className={styles.questionLabel}>{questionLabel(index)}</div>
			<div className={styles.questionImageArea}>
				{info.image ? (
					<img src={mediaUrl(info.image)} alt="" className={styles.questionImage} />
				) : (
					<span className={styles.muted}>画像なし</span>
				)}
			</div>
			<div className={styles.questionBody}>
				<div className={styles.answerRow}>
					<span className={styles.answerText}>{question.answer}</span>
					{info.notation && <span className={styles.notationText}>{info.notation}</span>}
					<span className={styles.muted}>{info.charCount} 文字</span>
				</div>
				{info.altAnswers.length > 0 && (
					<div className={styles.muted}>別解: {info.altAnswers.join('、')}</div>
				)}
				{question.note && <div className={styles.note}>{question.note}</div>}
				<dl className={styles.hintList}>
					{HINT_KINDS.map((kind) => (
						<div key={kind} className={styles.hintItem}>
							<dt>{HINT_NAMES[kind]}</dt>
							<dd>{info.hints[kind] ?? '—'}</dd>
						</div>
					))}
				</dl>
				{state.phase !== 'waiting' && (
					<div className={styles.solvers}>
						<strong>
							正解 {summary.solvers.length} / {game.participants.length} 人
						</strong>
						{summary.solvers.map((s) => (
							<span
								key={s.participantId}
								className={styles.solverChip}
								data-first={firsts.has(s.participantId) ? 'true' : undefined}
							>
								{participantName(game, s.participantId)} {formatClock(s.elapsedMs)}
								<HintIcons hints={s.hints} />
							</span>
						))}
					</div>
				)}
				{wrongs.length > 0 && (
					<ul className={styles.wrongList}>
						{wrongs.map((w) => (
							<li key={w.participantId}>
								<span className={styles.wrongName}>{participantName(game, w.participantId)}</span>
								{w.texts.join('、')}
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
};

const phaseLabel = (state: PalindromeState, over: boolean) => {
	if (state.phase === 'waiting') return '開始前';
	if (state.phase === 'finished') return '終了';
	return over ? '時間切れ (結果未確定)' : '開催中';
};

export const HostView = ({view, send, undo}: ScreenProps<PalindromeState>) => {
	const {game, undoable} = view;
	const {state} = game;
	const run = useRun();
	const notify = useNotify();
	const clock = useContestClock(state);
	const [durationInput, setDurationInput] = useState(String(Math.round(state.durationMs / 60_000)));
	const [extendInput, setExtendInput] = useState('5');

	const standings = useMemo(
		() => computeStandings(state, game.participants),
		[state, game.participants],
	);
	// 開始前は現在の問題、開始後はコンテストの問題を並べる
	const questions = state.phase === 'waiting' ? game.questions : contestQuestions(game);

	const act = (command: {type: string} & Record<string, unknown>) => run(() => send(command));

	const onSetDuration = (event: FormEvent) => {
		event.preventDefault();
		const minutes = Number.parseInt(durationInput, 10);
		if (Number.isNaN(minutes)) return;
		void act({type: 'setDuration', minutes});
	};

	const onStart = () => {
		const minutes = Math.round(state.durationMs / 60_000);
		if (
			window.confirm(
				`全 ${game.questions.length} 問、制限時間 ${minutes} 分でコンテストを開始しますか?`,
			)
		) {
			void act({type: 'start'});
		}
	};

	const onExtend = (minutes: number) => {
		if (Number.isNaN(minutes) || minutes <= 0) return;
		void act({type: 'extend', minutes});
	};

	const onFinish = () => {
		const message = clock.over
			? '結果を確定して、答えを公開しますか?'
			: 'まだ時間が残っています。コンテストを打ち切りますか?';
		if (window.confirm(message)) {
			void act({type: 'finish'});
		}
	};

	const onUndo = async () => {
		if (!undoable || !window.confirm(`「${undoable}」を取り消しますか?`)) {
			return;
		}
		const undone = await run(undo);
		if (undone) notify(`「${undone}」を取り消しました`);
	};

	const header = (
		<header className={styles.header}>
			<div className={styles.titleArea}>
				<div className={styles.gameTitle}>{game.title} (司会者)</div>
				<span
					className={styles.phaseBadge}
					data-phase={game.review !== null ? 'review' : state.phase}
				>
					{game.review !== null ? '感想戦中' : phaseLabel(state, clock.over)}
				</span>
			</div>
			<div className={styles.headerLinks}>
				{game.review === null && (
					<button type="button" onClick={onUndo} disabled={!undoable} title="直前の操作を取り消す">
						↶ 取り消し{undoable ? `: ${undoable}` : ''}
					</button>
				)}
				<Link to={`/games/${game.id}/edit`}>問題編集</Link>
				<Link to={`/games/${game.id}/monitor`} target="_blank">
					モニター画面 ↗
				</Link>
				<Link to="/">トップへ</Link>
			</div>
		</header>
	);

	if (game.review !== null) {
		return (
			<div className={styles.container}>
				{header}
				<ReviewControls game={game} send={send} />
			</div>
		);
	}

	return (
		<div className={styles.container}>
			{header}

			<section className={styles.controlBar}>
				{state.phase === 'waiting' && (
					<>
						<form className={styles.inlineForm} onSubmit={onSetDuration}>
							<label>
								制限時間
								<input
									type="number"
									min={1}
									max={MAX_DURATION_MINUTES}
									value={durationInput}
									onChange={(e) => setDurationInput(e.target.value)}
									className={styles.numberInput}
								/>
								分
							</label>
							<button type="submit" className={styles.buttonSecondary}>
								設定
							</button>
							<span className={styles.muted}>
								(現在 {Math.round(state.durationMs / 60_000)} 分)
							</span>
						</form>
						<button
							type="button"
							className={styles.buttonPrimary}
							onClick={onStart}
							disabled={game.questions.length === 0}
						>
							コンテスト開始
						</button>
					</>
				)}

				{state.phase === 'running' && (
					<>
						<div className={styles.clock} data-over={clock.over ? 'true' : undefined}>
							{clock.over ? '時間切れ' : `残り ${formatClock(clock.remainingMs)}`}
						</div>
						{!clock.over && (
							<div className={styles.inlineForm}>
								<span>延長:</span>
								<button
									type="button"
									className={styles.buttonSecondary}
									onClick={() => onExtend(1)}
								>
									+1 分
								</button>
								<button
									type="button"
									className={styles.buttonSecondary}
									onClick={() => onExtend(5)}
								>
									+5 分
								</button>
								<input
									type="number"
									min={1}
									max={MAX_DURATION_MINUTES}
									value={extendInput}
									onChange={(e) => setExtendInput(e.target.value)}
									className={styles.numberInput}
									aria-label="延長する分数"
								/>
								<button
									type="button"
									className={styles.buttonSecondary}
									onClick={() => onExtend(Number.parseInt(extendInput, 10))}
								>
									分延長
								</button>
							</div>
						)}
						<button
							type="button"
							className={clock.over ? styles.buttonPrimary : styles.buttonDanger}
							onClick={onFinish}
						>
							{clock.over ? '結果を確定する' : 'コンテストを打ち切る'}
						</button>
					</>
				)}

				{state.phase === 'finished' && (
					<>
						<div className={styles.clock} data-over="true">
							終了
						</div>
						<button
							type="button"
							className={styles.buttonPrimary}
							onClick={() => act({type: 'review.start'})}
						>
							感想戦を始める
						</button>
					</>
				)}
			</section>

			{/* AI 参加者の状態と操作は #15 でここに足す */}

			{state.phase !== 'waiting' && (
				<section className={styles.card}>
					<h2 className={styles.cardTitle}>スコアボード</h2>
					<div className={styles.scoreboardWrap}>
						<Scoreboard game={game} standings={standings} variant="page" />
					</div>
				</section>
			)}

			<section className={styles.card}>
				<h2 className={styles.cardTitle}>問題 ({questions.length} 問)</h2>
				{questions.length === 0 ? (
					<p className={styles.muted}>
						問題がありません。<Link to={`/games/${game.id}/edit`}>問題編集</Link>
						で追加してください。
					</p>
				) : (
					<div className={styles.questionList}>
						{questions.map((q, index) => (
							<QuestionCard key={q.id} game={game} question={q} index={index} />
						))}
					</div>
				)}
			</section>
		</div>
	);
};
