import {mediaUrl} from '../../../shared/media.ts';
import {
	computeQuestionSummary,
	HINT_KINDS,
	HINT_NAMES,
	type PalindromeState,
	questionLabel,
} from '../../../shared/modes/palindrome/index.ts';
import type {ReviewMonitorProps} from '../types.ts';
import {formatClock, formatPenalty, participantName, questionView} from './helpers.ts';
import styles from './ReviewMonitor.module.css';
import {HINT_ICONS, HintIcons} from './Scoreboard.tsx';

/** 感想戦: 1 問ずつ、問題・ヒント・答え・正解者・最初の正解者を表示する */
export const ReviewMonitor = ({view, item, index, total}: ReviewMonitorProps<PalindromeState>) => {
	const {game} = view;
	const question = game.questions.find((q) => q.id === item.questionId);
	const label = questionLabel(item.recordIndex);
	const summary = computeQuestionSummary(game.state, item.questionId, game.participants);
	const firsts = new Set(summary.firstSolverIds);
	const firstSolvers = summary.solvers.filter((s) => firsts.has(s.participantId));
	const info = question ? questionView(question) : null;
	const isAi = (id: string) => game.participants.find((p) => p.id === id)?.kind === 'ai';

	return (
		<div className={styles.stage}>
			<header className={styles.header}>
				<div className={styles.title}>{game.title}</div>
				<div className={styles.headline}>
					感想戦 <span className={styles.label}>問題 {label}</span>
				</div>
				<div className={styles.progress}>
					{index + 1} / {total}
				</div>
			</header>

			{!question || !info ? (
				<div className={styles.missing}>問題が見つかりません</div>
			) : (
				<main className={styles.main}>
					<section className={styles.imagePane}>
						{info.image ? (
							<img
								src={mediaUrl(info.image)}
								alt={`問題 ${label} のイラスト`}
								className={styles.image}
							/>
						) : (
							<div className={styles.noImage}>画像なし</div>
						)}
						<div className={styles.charCount}>{info.charCount} 文字</div>
					</section>

					<section className={styles.infoPane}>
						<div className={styles.answerCard}>
							<div className={styles.answer}>{question.answer}</div>
							{info.notation && <div className={styles.notation}>{info.notation}</div>}
							{info.altAnswers.length > 0 && (
								<div className={styles.altAnswers}>別解: {info.altAnswers.join('、')}</div>
							)}
						</div>

						<ul className={styles.hints}>
							{HINT_KINDS.map((kind) => (
								<li key={kind} className={styles.hint}>
									<span className={styles.hintName} data-kind={kind}>
										{HINT_ICONS[kind]}
									</span>
									<span className={styles.hintLabel}>{HINT_NAMES[kind]}</span>
									<span className={styles.hintBody}>{info.hints[kind] ?? '—'}</span>
								</li>
							))}
						</ul>

						<div className={styles.solversCard}>
							<div className={styles.solversHeader}>
								<span>正解者</span>
								<span className={styles.solvedCount}>
									<strong>{summary.solvers.length}</strong> / {game.participants.length} 人
								</span>
							</div>
							{firstSolvers.length > 0 ? (
								<div className={styles.first}>
									<span className={styles.firstLabel}>最初の正解者</span>
									<span className={styles.firstName}>
										{firstSolvers.map((s) => participantName(game, s.participantId)).join('、')}
									</span>
									<span className={styles.firstTime}>
										{formatClock(firstSolvers[0]?.elapsedMs ?? null)}
									</span>
								</div>
							) : (
								<div className={styles.noSolver}>正解者はいませんでした</div>
							)}
							<ol className={styles.solverList}>
								{summary.solvers.map((s, i) => (
									<li
										key={s.participantId}
										className={styles.solver}
										data-first={firsts.has(s.participantId) ? 'true' : undefined}
									>
										<span className={styles.solverRank}>{i + 1}</span>
										<span className={styles.solverName}>
											{participantName(game, s.participantId)}
											{isAi(s.participantId) && <span className={styles.aiBadge}>AI</span>}
										</span>
										<span className={styles.solverTime}>{formatClock(s.elapsedMs)}</span>
										<span className={styles.solverHints}>
											<HintIcons hints={s.hints} />
											{s.penaltyMs > 0 && (
												<span className={styles.solverPenalty}>{formatPenalty(s.penaltyMs)}</span>
											)}
										</span>
									</li>
								))}
							</ol>
						</div>
					</section>
				</main>
			)}
		</div>
	);
};
