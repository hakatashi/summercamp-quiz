import type {CSSProperties} from 'react';
import {
	HINT_KINDS,
	HINT_NAMES,
	type HintKind,
	type PalindromeCell,
	type PalindromeStanding,
	type PalindromeState,
	questionLabel,
} from '../../../shared/modes/palindrome/index.ts';
import type {Game} from '../../../shared/types.ts';
import {formatClock, formatPenalty} from './helpers.ts';
import styles from './Scoreboard.module.css';

/** ヒントの種類を表す1文字のアイコン */
export const HINT_ICONS: Record<HintKind, string> = {
	situation: '状',
	irasutoya: 'い',
	charTypes: '字',
};

export const HintIcons = ({hints}: {hints: HintKind[]}) => (
	<span className={styles.hintIcons}>
		{HINT_KINDS.filter((kind) => hints.includes(kind)).map((kind) => (
			<span
				key={kind}
				className={styles.hintIcon}
				data-kind={kind}
				title={`${HINT_NAMES[kind]}ヒント`}
			>
				{HINT_ICONS[kind]}
			</span>
		))}
	</span>
);

const Cell = ({cell}: {cell: PalindromeCell | undefined}) => {
	if (!cell || (!cell.solved && cell.wrongCount === 0 && cell.hints.length === 0)) {
		return <td className={styles.cell} />;
	}
	if (cell.solved) {
		return (
			<td
				className={styles.cell}
				data-result={cell.firstSolver ? 'first' : 'solved'}
				title={cell.firstSolver ? '最初の正解者' : undefined}
			>
				<div className={styles.cellTime}>{formatClock(cell.elapsedMs)}</div>
				<div className={styles.cellSub}>
					{cell.wrongCount > 0 && <span className={styles.cellWrong}>({cell.wrongCount})</span>}
					<HintIcons hints={cell.hints} />
				</div>
			</td>
		);
	}
	return (
		<td className={styles.cell} data-result="unsolved">
			{cell.wrongCount > 0 && <div className={styles.cellMiss}>−{cell.wrongCount}</div>}
			<div className={styles.cellSub}>
				<HintIcons hints={cell.hints} />
			</div>
		</td>
	);
};

export interface ScoreboardProps {
	game: Game<PalindromeState>;
	/** 表示する行 (モニターのページ送りでは一部だけ渡す) */
	standings: PalindromeStanding[];
	variant: 'monitor' | 'page';
	/** 強調する参加者 (参加者画面の自分) */
	highlightId?: string | null;
}

/** スコアボード (各参加者 × 各問題の正解状況と総合順位) */
export const Scoreboard = ({game, standings, variant, highlightId}: ScoreboardProps) => {
	const {questionIds} = game.state;
	const names = new Map(game.participants.map((p) => [p.id, p]));

	return (
		<table
			className={styles.table}
			data-variant={variant}
			style={{'--question-count': questionIds.length} as CSSProperties}
		>
			<thead>
				<tr>
					<th className={styles.rankHead}>順位</th>
					<th className={styles.nameHead}>名前</th>
					<th className={styles.scoreHead}>正答</th>
					<th className={styles.timeHead}>時間</th>
					{questionIds.map((id, index) => (
						<th key={id} className={styles.questionHead}>
							{questionLabel(index)}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{standings.map((s) => {
					const participant = names.get(s.participantId);
					return (
						<tr
							key={s.participantId}
							className={styles.row}
							data-self={s.participantId === highlightId ? 'true' : undefined}
						>
							<td className={styles.rank}>{s.rank}</td>
							<td className={styles.name}>
								<span className={styles.nameText}>{participant?.name ?? '?'}</span>
								{participant?.kind === 'ai' && <span className={styles.aiBadge}>AI</span>}
							</td>
							<td className={styles.score}>{s.solvedCount}</td>
							<td className={styles.time}>
								<div className={styles.cellTime}>
									{s.solvedCount > 0 ? formatClock(s.scoreTimeMs) : '—'}
								</div>
								{s.solvedCount > 0 && (s.penaltyMs > 0 || s.wrongCount > 0) && (
									<div className={styles.cellSub}>
										{s.penaltyMs > 0 && <span>{formatPenalty(s.penaltyMs)}</span>}
										{s.wrongCount > 0 && <span className={styles.cellWrong}>({s.wrongCount})</span>}
									</div>
								)}
							</td>
							{questionIds.map((id) => (
								<Cell key={id} cell={s.cells[id]} />
							))}
						</tr>
					);
				})}
			</tbody>
		</table>
	);
};
