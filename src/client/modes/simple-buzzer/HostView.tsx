import {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router';
import {
	type BuzzStatus,
	currentRecord,
	describeResult,
	type SimpleBuzzerState,
	scoreOf,
	unaskedQuestions,
} from '../../../shared/modes/simple-buzzer/index.ts';
import {ReviewControls} from '../../components/ReviewControls.tsx';
import {useNotify, useRun} from '../../components/Toast.tsx';
import type {ScreenProps} from '../types.ts';
import styles from './HostView.module.css';
import {findQuestion, isOpen, participantName, questionNumber, standings} from './helpers.ts';

const phaseLabels: Record<SimpleBuzzerState['phase'], string> = {
	waiting: '開始前',
	reading: '読み上げ中',
	answering: '回答中',
	closed: '問題終了',
	finished: '全問終了',
};

const buzzLabels: Record<BuzzStatus, string> = {
	waiting: '待機',
	answering: '回答中',
	correct: '正解',
	wrong: '誤答',
	void: '無効',
};

const isTypingTarget = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const ScoreEditor = ({score, onSave}: {score: number; onSave: (score: number) => void}) => {
	const [value, setValue] = useState(String(score));
	useEffect(() => setValue(String(score)), [score]);
	const commit = () => {
		const next = Number.parseInt(value, 10);
		if (Number.isNaN(next)) {
			setValue(String(score));
		} else if (next !== score) {
			onSave(next);
		}
	};
	return (
		<input
			className={styles.scoreInput}
			type="number"
			value={value}
			onChange={(event) => setValue(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') commit();
			}}
		/>
	);
};

export const HostView = ({view, send, undo}: ScreenProps<SimpleBuzzerState>) => {
	const {game, online, undoable} = view;
	const {state} = game;
	const run = useRun();
	const notify = useNotify();
	const record = currentRecord(state);
	const question = record ? findQuestion(game, record.questionId) : undefined;
	const upcoming = unaskedQuestions(game);
	const open = isOpen(state);
	const answering = record?.buzzes.find((b) => b.status === 'answering');
	const nextQuestion = upcoming[0];

	const act = (command: {type: string} & Record<string, unknown>) => run(() => send(command));

	// キーボードショートカット (入力欄にフォーカスがないときだけ)
	const shortcuts = useRef<Record<string, () => void>>({});
	shortcuts.current = {
		o: () => answering && act({type: 'judge', correct: true}),
		x: () => answering && act({type: 'judge', correct: false}),
		n: () => !open && state.phase !== 'finished' && act({type: 'next'}),
	};
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
			if (isTypingTarget(event.target)) return;
			shortcuts.current[event.key.toLowerCase()]?.();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, []);

	const onUndo = async () => {
		if (!undoable || !window.confirm(`「${undoable}」を取り消しますか?`)) return;
		const undone = await run(undo);
		if (undone) notify(`「${undone}」を取り消しました`);
	};

	const onCancel = (returnToPool: boolean) => {
		const message = returnToPool
			? 'この問題の出題を取り消し、未出題に戻しますか? (この問題での得点の増減も取り消します)'
			: 'この問題の出題を取り消しますか? (この問題での得点の増減も取り消します)';
		if (window.confirm(message)) void act({type: 'cancel', returnToPool});
	};

	const onRemove = (participantId: string) => {
		const name = participantName(game, participantId);
		if (window.confirm(`参加者「${name}」を削除しますか?`)) {
			void act({type: 'participants.remove', participantId});
		}
	};

	const onRename = (participantId: string) => {
		const name = window.prompt('新しい名前', participantName(game, participantId));
		if (name?.trim()) void act({type: 'participants.rename', participantId, name: name.trim()});
	};

	const number = questionNumber(state);
	const previewQuestion = open || state.phase === 'closed' ? question : nextQuestion;

	const completedQuestionCount = state.history.filter(
		(r) => r.result !== null && r.result !== 'cancelled',
	).length;

	if (game.review !== null) {
		return (
			<div className={styles.container}>
				<header className={styles.header}>
					<div className={styles.titleArea}>
						<h1 className={styles.title}>{game.title}</h1>
						<span className={styles.phase}>感想戦中</span>
					</div>
					<div className={styles.headerActions}>
						<Link to={`/games/${game.id}/monitor`} target="_blank">
							モニター
						</Link>
						<Link to={`/games/${game.id}/edit`} target="_blank">
							問題編集
						</Link>
					</div>
				</header>
				<ReviewControls game={game} send={send} />
			</div>
		);
	}

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<div className={styles.titleArea}>
					<h1 className={styles.title}>{game.title}</h1>
					<span className={styles.phase} data-phase={state.phase}>
						{phaseLabels[state.phase]}
					</span>
					<span className={styles.muted}>
						出題 {state.history.filter((r) => r.result !== 'cancelled').length} 問 ・ 残り{' '}
						{upcoming.length} 問
					</span>
				</div>
				<div className={styles.headerActions}>
					<button
						type="button"
						onClick={() => act({type: 'review.start'})}
						disabled={completedQuestionCount === 0}
						title="出題した問題を振り返る"
					>
						感想戦を始める
					</button>
					<button type="button" onClick={onUndo} disabled={!undoable} title="直前の操作を取り消す">
						↶ 取り消し{undoable ? `: ${undoable}` : ''}
					</button>
					<Link to={`/games/${game.id}/monitor`} target="_blank">
						モニター
					</Link>
					<Link to={`/games/${game.id}/edit`} target="_blank">
						問題編集
					</Link>
				</div>
			</header>

			<div className={styles.main}>
				<div className={styles.left}>
					<section className={styles.card}>
						<div className={styles.cardHeader}>
							<h2>
								{open || state.phase === 'closed'
									? `第 ${number} 問${state.phase === 'closed' ? ' (終了)' : ''}`
									: '次の問題'}
							</h2>
							{record?.result && (
								<span className={styles.result}>{describeResult(record.result)}</span>
							)}
						</div>
						{previewQuestion ? (
							<>
								<p className={styles.questionText}>{previewQuestion.text}</p>
								<p className={styles.answer}>
									<span className={styles.answerLabel}>答え</span>
									{previewQuestion.answer}
								</p>
								{previewQuestion.note && <p className={styles.note}>{previewQuestion.note}</p>}
							</>
						) : (
							<p className={styles.muted}>
								{state.phase === 'finished'
									? '全ての問題が終了しました'
									: '未出題の問題がありません'}
							</p>
						)}
						<div className={styles.controls}>
							{open ? (
								<>
									<button type="button" onClick={() => act({type: 'close'})}>
										スルー (問題終了)
									</button>
									<button
										type="button"
										onClick={() => act({type: 'resetBuzzes'})}
										disabled={
											!record?.buzzes.some(
												(b) => b.status === 'waiting' || b.status === 'answering',
											)
										}
									>
										ボタン押下をリセット
									</button>
									<button type="button" onClick={() => onCancel(true)}>
										出題を取り消して未出題に戻す
									</button>
								</>
							) : (
								<>
									<button
										type="button"
										className={styles.primary}
										onClick={() => act({type: 'next'})}
										disabled={state.phase === 'finished'}
									>
										{nextQuestion ? '次の問題を出題' : '結果発表 (全問終了)'} <kbd>N</kbd>
									</button>
									{state.phase === 'finished' && (
										<button
											type="button"
											className={styles.primary}
											onClick={() => act({type: 'review.start'})}
											disabled={completedQuestionCount === 0}
										>
											感想戦を始める
										</button>
									)}
									{state.phase === 'closed' && (
										<button type="button" onClick={() => onCancel(true)}>
											この問題を未出題に戻す
										</button>
									)}
								</>
							)}
						</div>
					</section>

					<section className={styles.card}>
						<h2>回答権</h2>
						{answering ? (
							<div className={styles.answering}>
								<div className={styles.answeringName}>
									{participantName(game, answering.participantId)}
								</div>
								<div className={styles.judgeButtons}>
									<button
										type="button"
										className={styles.correct}
										onClick={() => act({type: 'judge', correct: true})}
									>
										○ 正解 <kbd>O</kbd>
									</button>
									<button
										type="button"
										className={styles.wrong}
										onClick={() => act({type: 'judge', correct: false})}
									>
										× 誤答 <kbd>X</kbd>
									</button>
								</div>
							</div>
						) : (
							<p className={styles.muted}>
								{state.phase === 'reading' ? 'ボタンが押されるのを待っています' : '—'}
							</p>
						)}
						{record && record.buzzes.length > 0 && (
							<ol className={styles.buzzList}>
								{record.buzzes.map((buzz) => (
									<li key={buzz.participantId} data-status={buzz.status}>
										<span>{participantName(game, buzz.participantId)}</span>
										<span className={styles.buzzMeta}>
											+{((buzz.pressedAt - record.startedAt) / 1000).toFixed(2)}秒 ・{' '}
											{buzzLabels[buzz.status]}
										</span>
									</li>
								))}
							</ol>
						)}
					</section>

					{!open && upcoming.length > 1 && (
						<section className={styles.card}>
							<h2>未出題の問題</h2>
							<ol className={styles.upcoming}>
								{upcoming.map((q) => (
									<li key={q.id}>
										<span className={styles.upcomingText}>{q.text}</span>
										<button
											type="button"
											onClick={() => act({type: 'next', questionId: q.id})}
											disabled={state.phase === 'finished'}
										>
											これを出題
										</button>
									</li>
								))}
							</ol>
						</section>
					)}
				</div>

				<div className={styles.right}>
					<section className={styles.card}>
						<h2>参加者 ({game.participants.length} 人)</h2>
						{game.participants.length === 0 && (
							<p className={styles.muted}>
								参加者は <code>/games/{game.id}/play</code> から参加できます
							</p>
						)}
						<table className={styles.table}>
							<tbody>
								{standings(game).map(({participant, rank}) => (
									<tr key={participant.id}>
										<td className={styles.rank}>{rank}</td>
										<td>
											<span
												className={styles.dot}
												data-online={online.includes(participant.id)}
												title={online.includes(participant.id) ? '接続中' : '未接続'}
											/>
											{participant.name}
										</td>
										<td>
											<ScoreEditor
												score={scoreOf(state, participant.id)}
												onSave={(score) =>
													act({type: 'setScore', participantId: participant.id, score})
												}
											/>
										</td>
										<td className={styles.rowActions}>
											<button type="button" onClick={() => onRename(participant.id)}>
												名前
											</button>
											<button type="button" onClick={() => onRemove(participant.id)}>
												削除
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>

					<section className={styles.card}>
						<h2>出題履歴</h2>
						<ol className={styles.history} reversed>
							{[...state.history].reverse().map((r) => (
								<li key={`${r.questionId}:${r.startedAt}`}>
									<span className={styles.historyText}>
										{findQuestion(game, r.questionId)?.text ?? '(削除された問題)'}
									</span>
									<span className={styles.buzzMeta}>
										{r.result ? describeResult(r.result) : '出題中'}
										{r.buzzes
											.filter((b) => b.status === 'correct')
											.map((b) => ` ・ ${participantName(game, b.participantId)}`)}
									</span>
								</li>
							))}
						</ol>
					</section>
				</div>
			</div>
		</div>
	);
};
