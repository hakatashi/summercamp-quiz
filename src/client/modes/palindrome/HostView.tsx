import {useMemo} from 'react';
import {Link} from 'react-router';
import {mediaUrl} from '../../../shared/media.ts';
import {
	computeQuestionStandings,
	currentRecord,
	getCharTypesHint,
	HINT_NAMES,
	unaskedQuestions,
} from '../../../shared/modes/palindrome/index.ts';
import type {
	PalindromeQuestionExtra,
	PalindromeState,
} from '../../../shared/modes/palindrome/types.ts';
import {useNotify, useRun} from '../../components/Toast.tsx';
import type {ScreenProps} from '../types.ts';
import styles from './HostView.module.css';
import {findQuestion, formatPenalty, formatTime, isOpen, questionNumber} from './helpers.ts';

const phaseLabels: Record<PalindromeState['phase'], string> = {
	waiting: '開始前',
	open: '出題中',
	closed: '問題終了',
	finished: '全問終了',
};

export const HostView = ({view, send, undo}: ScreenProps<PalindromeState>) => {
	const {game, undoable} = view;
	const {state} = game;
	const run = useRun();
	const notify = useNotify();

	const record = currentRecord(state);
	const question = record ? findQuestion(game, record.questionId) : undefined;
	const extra = (question?.extra ?? {}) as Partial<PalindromeQuestionExtra>;
	const open = isOpen(state);
	const qNum = questionNumber(state);
	const remainingQuestions = unaskedQuestions(game);

	const standings = useMemo(() => {
		if (!record) return [];
		return computeQuestionStandings(record, game.participants);
	}, [record, game.participants]);

	const onNext = async () => {
		if (open) {
			if (!window.confirm('出題中の問題を終了して次の問題へ進みますか?')) {
				return;
			}
		}
		await run(() => send({type: 'next'}));
	};

	const onClose = async () => {
		if (!open) return;
		await run(() => send({type: 'close'}));
	};

	const onFinish = async () => {
		if (!window.confirm('企画を終了しますか?')) {
			return;
		}
		await run(() => send({type: 'finish'}));
	};

	const onToggleStandings = async () => {
		await run(() => send({type: 'showStandings', show: !state.showStandings}));
	};

	const onUndo = async () => {
		if (!undoable || !window.confirm(`「${undoable}」を取り消しますか?`)) {
			return;
		}
		const undone = await run(undo);
		if (undone) notify(`「${undone}」を取り消しました`);
	};

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<div className={styles.titleArea}>
					<div className={styles.gameTitle}>{game.title} (司会者)</div>
					<div>
						<span className={`${styles.phaseBadge} ${styles[`phase_${state.phase}`]}`}>
							{phaseLabels[state.phase]}
						</span>
						{record && (
							<span style={{marginLeft: '8px', fontWeight: 700}}>
								第 {qNum} 問 (残り {remainingQuestions.length} 問)
							</span>
						)}
					</div>
				</div>
				<div className={styles.headerLinks}>
					<Link to={`/games/${game.id}/edit`}>問題編集</Link>
					<Link to={`/games/${game.id}/monitor`} target="_blank">
						モニター画面 ↗
					</Link>
					<Link to="/">トップへ</Link>
				</div>
			</header>

			{/* コントロールボタンバー */}
			<div className={styles.controlBar}>
				<button
					type="button"
					className={styles.buttonPrimary}
					onClick={onNext}
					disabled={state.phase === 'finished'}
				>
					次の問題へ {open ? '(終了して次へ)' : ''}
				</button>

				<button type="button" className={styles.buttonSecondary} onClick={onClose} disabled={!open}>
					問題を終了
				</button>

				<button
					type="button"
					className={`${styles.buttonSecondary} ${
						state.showStandings ? styles.buttonStandingsActive : ''
					}`}
					onClick={onToggleStandings}
				>
					{state.showStandings ? '総合順位を戻す' : '総合順位をモニターに表示'}
				</button>

				<button
					type="button"
					className={styles.buttonDanger}
					onClick={onFinish}
					disabled={state.phase === 'finished'}
				>
					企画を終える
				</button>

				{undoable && (
					<button type="button" className={styles.buttonSecondary} onClick={onUndo}>
						取り消し: {undoable}
					</button>
				)}
			</div>

			{/* 出題中の問題情報 */}
			{question && (
				<section className={styles.questionPanel}>
					<div className={styles.imageArea}>
						{extra.image ? (
							<img
								src={mediaUrl(extra.image)}
								alt="回文イラスト"
								className={styles.questionImage}
							/>
						) : (
							<div
								style={{
									width: '100%',
									height: '160px',
									background: '#f1f5f9',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									borderRadius: '8px',
								}}
							>
								画像なし
							</div>
						)}
					</div>

					<div className={styles.questionInfo}>
						<div className={styles.answerRow}>
							<span className={styles.answerText}>{question.answer}</span>
							{extra.notation && <span className={styles.notationText}>({extra.notation})</span>}
						</div>
						{extra.altAnswers && extra.altAnswers.length > 0 && (
							<div className={styles.altAnswersText}>別解: {extra.altAnswers.join('、')}</div>
						)}

						<div className={styles.hintsGrid}>
							<div className={styles.hintCard}>
								<div className={styles.hintLabel}>状況説明ヒント</div>
								<div className={styles.hintContent}>{extra.hints?.situation || '—'}</div>
							</div>
							<div className={styles.hintCard}>
								<div className={styles.hintLabel}>いらすとやヒント</div>
								<div className={styles.hintContent}>{extra.hints?.irasutoya || '—'}</div>
							</div>
							<div className={styles.hintCard}>
								<div className={styles.hintLabel}>文字種ヒント</div>
								<div className={styles.hintContent}>
									{getCharTypesHint(extra.notation ?? '', extra.hints?.charTypes) || '—'}
								</div>
							</div>
						</div>
					</div>
				</section>
			)}

			{/* 参加者状況テーブル */}
			{record && (
				<section className={styles.tableCard}>
					<div className={styles.tableHeader}>
						<h2 className={styles.tableTitle}>参加者の回答状況</h2>
					</div>
					<div className={styles.tableWrapper}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th>順位</th>
									<th>参加者</th>
									<th>状態</th>
									<th>経過時間</th>
									<th>ペナルティ</th>
									<th>記録時間</th>
									<th>開けたヒント</th>
									<th>誤答 (本文)</th>
								</tr>
							</thead>
							<tbody>
								{standings.map((s) => {
									const p = game.participants.find((item) => item.id === s.participantId);
									const pRec = record.participants[s.participantId];
									const wrongList = pRec?.wrong ?? [];

									return (
										<tr key={s.participantId}>
											<td className={styles.rankCell}>{s.correct ? `${s.rank}位` : '—'}</td>
											<td>
												<div className={styles.participantCell}>
													{p?.name ?? '?'}
													{p?.kind === 'ai' && <span className={styles.aiBadge}>AI</span>}
												</div>
											</td>
											<td>
												{s.correct ? (
													<span className={styles.statusCorrect}>○ 正解</span>
												) : open ? (
													<span className={styles.statusAnswering}>回答中</span>
												) : (
													<span className={styles.statusWrong}>× 不正解</span>
												)}
											</td>
											<td>{s.correct ? formatTime(s.elapsedMs) : '—'}</td>
											<td>{s.penaltyMs > 0 ? formatPenalty(s.penaltyMs) : '0 秒'}</td>
											<td>{s.correct ? <strong>{formatTime(s.recordTimeMs)}</strong> : '—'}</td>
											<td>
												<div className={styles.badgeList}>
													{s.openedHints.map((kind) => (
														<span key={kind} className={styles.hintBadge}>
															{HINT_NAMES[kind]}
														</span>
													))}
													{s.openedHints.length === 0 && '—'}
												</div>
											</td>
											<td>
												{wrongList.length > 0 ? (
													<div className={styles.wrongList}>
														<span>{wrongList.length} 回:</span>
														{wrongList.map((w, i) => (
															// biome-ignore lint/suspicious/noArrayIndexKey: 誤答一覧
															<span key={i} className={styles.wrongItem}>
																{w.text}
															</span>
														))}
													</div>
												) : (
													'—'
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</section>
			)}

			{/* AI の状態と操作プレースホルダー (#15 用) */}
			<section className={styles.aiPlaceholderCard}>
				<div className={styles.aiPlaceholderTitle}>🤖 AI 参加者の制御 (Issue #15 で実装予定)</div>
				<div>出題と連動して AI が自律推論し、ヒント開放・回答を行います。</div>
			</section>
		</div>
	);
};
