import {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router';
import {
	type BuzzerBoardState,
	type BuzzStatus,
	currentRecord,
	describeResult,
	GENRES,
	type Genre,
	isCleared,
	restOf,
	scoreOf,
	unaskedQuestions,
} from '../../../shared/modes/buzzer-board/index.ts';
import {ReviewControls} from '../../components/ReviewControls.tsx';
import {useNotify, useRun} from '../../components/Toast.tsx';
import type {ScreenProps} from '../types.ts';
import styles from './HostView.module.css';
import {
	findQuestion,
	isOpen,
	normalizeAnswer,
	participantName,
	questionNumber,
	standings,
} from './helpers.ts';

const phaseLabels: Record<string, string> = {
	waiting: '開始前',
	reading: '読み上げ中',
	answering: '回答中',
	'board-answering': 'ボード回答受付中',
	'board-judging': 'ボード判定中',
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

const NumberEditor = ({
	value,
	min,
	onSave,
}: {
	value: number;
	min?: number;
	onSave: (val: number) => void;
}) => {
	const [text, setText] = useState(String(value));
	useEffect(() => setText(String(value)), [value]);
	const commit = () => {
		const next = Number.parseInt(text, 10);
		if (Number.isNaN(next) || (min !== undefined && next < min)) {
			setText(String(value));
		} else if (next !== value) {
			onSave(next);
		}
	};
	return (
		<input
			className={styles.numInput}
			type="number"
			value={text}
			min={min}
			onChange={(e) => setText(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === 'Enter') commit();
			}}
		/>
	);
};

export const HostView = ({view, send, undo}: ScreenProps<BuzzerBoardState>) => {
	const {game, online, undoable} = view;
	const {state} = game;
	const run = useRun();
	const notify = useNotify();
	const record = currentRecord(state);
	const question = record ? findQuestion(game, record.questionId) : undefined;
	const upcoming = unaskedQuestions(game);
	const open = isOpen(state);
	const isBoard = state.phase.startsWith('board-');
	const isClosedBoard = state.phase === 'closed' && Boolean(record?.board);
	const answering = record?.buzzes.find((b) => b.status === 'answering');

	const clearedParticipants = game.participants.filter((p) => state.cleared[p.id]);
	const boardAnswers = record?.board?.answers ?? {};
	const submittedCount = clearedParticipants.filter(
		(p) => boardAnswers[p.id]?.submittedAt !== null,
	).length;
	const unjudgedCount = clearedParticipants.filter(
		(p) => !boardAnswers[p.id] || boardAnswers[p.id]?.correct === null,
	).length;

	const groupedDuplicates = (() => {
		if (state.phase !== 'board-judging' && !isClosedBoard) return [];
		const groups = new Map<string, {sampleText: string; participants: string[]}>();
		for (const p of clearedParticipants) {
			const ans = boardAnswers[p.id];
			const rawText = ans && ans.submittedAt !== null ? ans.text : '';
			const key = normalizeAnswer(rawText);
			const group = groups.get(key) ?? {sampleText: rawText, participants: []};
			group.participants.push(p.id);
			groups.set(key, group);
		}
		return [...groups.entries()]
			.filter(([_, g]) => g.participants.length >= 2)
			.map(([normalized, g]) => ({normalized, ...g}));
	})();

	// 次に出題予定の問題 (同一ジャンルの未出題問題の先頭、または未出題の先頭)
	const nextQuestion =
		upcoming.find((q) => q.extra?.genre === state.nextGenre.genre) ?? upcoming[0];

	const act = (command: {type: string} & Record<string, unknown>) => run(() => send(command));

	// キーボードショートカット
	const shortcuts = useRef<Record<string, () => void>>({});
	shortcuts.current = {
		o: () => answering && act({type: 'judge', correct: true}),
		x: () => answering && act({type: 'judge', correct: false}),
		n: () => !open && !isBoard && state.phase !== 'finished' && act({type: 'next'}),
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
			? 'この問題の出題を取り消し、未出題に戻しますか? (この問題での得点の増減や休みも取り消します)'
			: 'この問題の出題を取り消しますか? (この問題での得点の増減や休みも取り消します)';
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
	const isCurrentQuestion = open || state.phase === 'closed' || isBoard;
	const previewQuestion = isCurrentQuestion ? question : nextQuestion;
	const currentGenre = isCurrentQuestion
		? record?.genre
		: ((previewQuestion?.extra?.genre as Genre | undefined) ?? state.nextGenre.genre);

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
						{phaseLabels[state.phase] ?? state.phase}
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
								{isCurrentQuestion
									? `第 ${number} 問${state.phase === 'closed' ? ' (終了)' : ''}`
									: '次の問題'}
							</h2>
							{record?.result && (
								<span className={styles.result}>{describeResult(record.result)}</span>
							)}
						</div>

						{previewQuestion ? (
							<>
								<div style={{marginTop: '4px'}}>
									{currentGenre && <span className={styles.genreBadge}>{currentGenre}</span>}
								</div>
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
									<button type="button" onClick={() => act({type: 'through'})}>
										スルー {clearedParticipants.length > 0 ? '(ボードクイズへ)' : '(問題終了)'}
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
							) : isBoard ? (
								<button type="button" onClick={() => onCancel(true)}>
									出題を取り消して未出題に戻す
								</button>
							) : (
								<>
									<button
										type="button"
										className={styles.primary}
										onClick={() => act({type: 'next'})}
										disabled={state.phase === 'finished'}
									>
										{upcoming.length > 0 ? '次の問題を出題' : '結果発表 (全問終了)'} <kbd>N</kbd>
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
						<h2>次のジャンル選択</h2>
						<div className={styles.genreSelectRow}>
							<span>
								現在の指定: <strong>{state.nextGenre.genre}</strong> (
								{state.genreChooser
									? `${participantName(game, state.genreChooser)} が選択中`
									: state.nextGenre.chosenBy
										? `${participantName(game, state.nextGenre.chosenBy)} が選択`
										: '自動選択'}
								)
							</span>
							<select
								className={styles.genreSelect}
								value={state.nextGenre.genre}
								onChange={(e) => act({type: 'setNextGenre', genre: e.target.value as Genre})}
							>
								{GENRES.map((g) => (
									<option key={g} value={g}>
										{g} (残り {state.unaskedCounts[g] ?? 0} 問)
									</option>
								))}
							</select>
						</div>
					</section>

					{isBoard || isClosedBoard ? (
						<section className={styles.card}>
							<div className={styles.cardHeader}>
								<h2>ボードクイズ</h2>
								<span className={styles.muted}>
									{state.phase === 'board-answering'
										? `回答受付中 (${submittedCount} / ${clearedParticipants.length} 人回答済み)`
										: state.phase === 'board-judging'
											? `判定中 (未判定 ${unjudgedCount} 件)`
											: '確定済み'}
								</span>
							</div>

							<div className={styles.boardActions}>
								{state.phase === 'board-answering' && (
									<button
										type="button"
										className={styles.primary}
										onClick={() => act({type: 'boardClose'})}
									>
										回答を締め切る
									</button>
								)}
								{state.phase === 'board-judging' && (
									<>
										<button
											type="button"
											className={styles.primary}
											onClick={() => act({type: 'boardConfirm'})}
											disabled={unjudgedCount > 0}
											title={unjudgedCount > 0 ? '未判定の回答が残っています' : undefined}
										>
											判定を確定する (得点加算)
										</button>
										<button type="button" onClick={() => act({type: 'boardReopen'})}>
											締め切りを取り消す (回答再開)
										</button>
									</>
								)}
							</div>

							{groupedDuplicates.length > 0 && (
								<div className={styles.bulkJudgeArea}>
									<div className={styles.bulkJudgeLabel}>同じ回答をまとめて判定:</div>
									<div className={styles.bulkJudgeList}>
										{groupedDuplicates.map((group) => (
											<div key={group.normalized} className={styles.bulkJudgeItem}>
												<span className={styles.bulkJudgeText}>
													「{group.sampleText || '(無回答)'}」({group.participants.length}人)
												</span>
												<button
													type="button"
													className={styles.bulkCorrectBtn}
													onClick={() => {
														for (const pId of group.participants) {
															void act({type: 'boardMark', participantId: pId, correct: true});
														}
													}}
												>
													○ 全員正解
												</button>
												<button
													type="button"
													className={styles.bulkWrongBtn}
													onClick={() => {
														for (const pId of group.participants) {
															void act({type: 'boardMark', participantId: pId, correct: false});
														}
													}}
												>
													× 全員不正解
												</button>
											</div>
										))}
									</div>
								</div>
							)}

							{clearedParticipants.length === 0 ? (
								<p className={styles.muted}>勝ち抜けた参加者がいません</p>
							) : (
								<table className={styles.boardTable}>
									<thead>
										<tr>
											<th>参加者</th>
											<th>回答</th>
											<th>送信時刻</th>
											<th>判定</th>
										</tr>
									</thead>
									<tbody>
										{clearedParticipants.map((p) => {
											const ans = boardAnswers[p.id];
											const hasSubmitted = ans && ans.submittedAt !== null;
											return (
												<tr key={p.id}>
													<td className={styles.boardParticipantName}>{p.name}</td>
													<td className={styles.boardAnswerText}>
														{hasSubmitted ? (
															ans.text
														) : state.phase === 'board-answering' ? (
															<span className={styles.muted}>未送信</span>
														) : (
															<span className={styles.muted}>（無回答）</span>
														)}
													</td>
													<td className={styles.boardTime}>
														{ans?.submittedAt != null && record?.startedAt
															? `+${((ans.submittedAt - record.startedAt) / 1000).toFixed(1)}s`
															: '—'}
													</td>
													<td>
														{state.phase === 'board-judging' ? (
															<div className={styles.judgeSwitch}>
																<button
																	type="button"
																	className={`${styles.judgeBtn} ${ans?.correct === true ? styles.activeCorrect : ''}`}
																	onClick={() =>
																		act({type: 'boardMark', participantId: p.id, correct: true})
																	}
																>
																	○
																</button>
																<button
																	type="button"
																	className={`${styles.judgeBtn} ${ans?.correct === false ? styles.activeWrong : ''}`}
																	onClick={() =>
																		act({type: 'boardMark', participantId: p.id, correct: false})
																	}
																>
																	×
																</button>
																<button
																	type="button"
																	className={`${styles.judgeBtn} ${ans?.correct === null ? styles.activeNull : ''}`}
																	onClick={() =>
																		act({type: 'boardMark', participantId: p.id, correct: null})
																	}
																>
																	未
																</button>
															</div>
														) : (
															<span>
																{ans?.correct === true ? (
																	<span className={styles.markCorrect}>○ 正解</span>
																) : ans?.correct === false ? (
																	<span className={styles.markWrong}>× 不正解</span>
																) : (
																	<span className={styles.muted}>未判定</span>
																)}
															</span>
														)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							)}
						</section>
					) : (
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
							<thead>
								<tr>
									<th>順</th>
									<th>名前</th>
									<th>得点</th>
									<th>休み</th>
									<th>勝抜</th>
									<th>連答</th>
									<th>操作</th>
								</tr>
							</thead>
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
											<NumberEditor
												value={scoreOf(state, participant.id)}
												onSave={(score) =>
													act({type: 'setScore', participantId: participant.id, score})
												}
											/>
										</td>
										<td>
											<NumberEditor
												value={restOf(state, participant.id)}
												min={0}
												onSave={(rest) =>
													act({type: 'setRest', participantId: participant.id, rest})
												}
											/>
										</td>
										<td>
											<input
												type="checkbox"
												checked={isCleared(state, participant.id)}
												onChange={(e) =>
													act({
														type: 'setCleared',
														participantId: participant.id,
														cleared: e.target.checked,
													})
												}
											/>
										</td>
										<td>
											<NumberEditor
												value={
													state.streak?.participantId === participant.id ? state.streak.count : 0
												}
												min={0}
												onSave={(count) =>
													act({
														type: 'setStreak',
														participantId: count > 0 ? participant.id : null,
														count,
													})
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
									<span className={styles.genreBadge}>{r.genre}</span>
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
