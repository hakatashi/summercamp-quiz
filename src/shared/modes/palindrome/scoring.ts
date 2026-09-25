import type {Participant} from '../../types.ts';
import {HINT_PENALTIES, type HintKind, type PalindromeState} from './types.ts';

/** 問題の番号 (A, B, C…。27 問目以降は数字) */
export const questionLabel = (index: number): string =>
	index < 26 ? String.fromCharCode(65 + index) : String(index + 1);

export const computeQuestionPenalty = (hints: Partial<Record<HintKind, number>>): number => {
	let penalty = 0;
	for (const kind of Object.keys(hints) as HintKind[]) {
		penalty += HINT_PENALTIES[kind] ?? 0;
	}
	return penalty;
};

/** スコアボードの1マス (参加者1人 × 1問) */
export interface PalindromeCell {
	solved: boolean;
	/** 開始から正解までの時間 */
	elapsedMs: number | null;
	/** この問題の誤答数 (正解していなくても数える。表示用) */
	wrongCount: number;
	hints: HintKind[];
	penaltyMs: number;
	/** この問題を最初に正解した人か */
	firstSolver: boolean;
}

export interface PalindromeStanding {
	rank: number;
	participantId: string;
	solvedCount: number;
	/** 最後に正解した時刻 (開始からの経過時間)。正解がなければ 0 */
	lastSolvedElapsedMs: number;
	/** 正解した問題で開けたヒントのペナルティの合計 */
	penaltyMs: number;
	/** 最終正答時間 + ペナルティ */
	scoreTimeMs: number;
	/** 正解した問題の誤答数の合計 */
	wrongCount: number;
	cells: Record<string, PalindromeCell>;
}

/** 問題ごとの最初の正解時刻 */
const firstCorrectAt = (state: PalindromeState, participants: Participant[]) => {
	const result = new Map<string, number>();
	for (const questionId of state.questionIds) {
		for (const p of participants) {
			const correctAt = state.attempts[questionId]?.[p.id]?.correctAt ?? null;
			if (correctAt === null) continue;
			const current = result.get(questionId);
			if (current === undefined || correctAt < current) {
				result.set(questionId, correctAt);
			}
		}
	}
	return result;
};

/**
 * 総合順位を計算する。
 * 正答数の多い順 → 最終正答時間 + (正解した問題の) ヒントペナルティ の短い順 → (正解した問題の) 誤答数の少ない順。
 * すべて同じなら同順位 (1, 2, 2, 4…)。
 */
export const computeStandings = (
	state: PalindromeState,
	participants: Participant[],
): PalindromeStanding[] => {
	const startedAt = state.startedAt ?? 0;
	const firsts = firstCorrectAt(state, participants);

	const standings: PalindromeStanding[] = participants.map((p) => {
		const cells: Record<string, PalindromeCell> = {};
		let solvedCount = 0;
		let lastSolvedElapsedMs = 0;
		let penaltyMs = 0;
		let wrongCount = 0;

		for (const questionId of state.questionIds) {
			const attempt = state.attempts[questionId]?.[p.id];
			const hints = attempt?.hints ?? {};
			const wrong = attempt?.wrong ?? [];
			const correctAt = attempt?.correctAt ?? null;
			const solved = correctAt !== null;
			const cellPenalty = computeQuestionPenalty(hints);
			const elapsedMs = solved ? correctAt - startedAt : null;
			cells[questionId] = {
				solved,
				elapsedMs,
				wrongCount: wrong.length,
				hints: Object.keys(hints) as HintKind[],
				penaltyMs: cellPenalty,
				firstSolver: solved && firsts.get(questionId) === correctAt,
			};
			if (solved && elapsedMs !== null) {
				solvedCount += 1;
				lastSolvedElapsedMs = Math.max(lastSolvedElapsedMs, elapsedMs);
				penaltyMs += cellPenalty;
				wrongCount += wrong.length;
			}
		}

		return {
			rank: 0,
			participantId: p.id,
			solvedCount,
			lastSolvedElapsedMs,
			penaltyMs,
			scoreTimeMs: lastSolvedElapsedMs + penaltyMs,
			wrongCount,
			cells,
		};
	});

	const compare = (a: PalindromeStanding, b: PalindromeStanding) =>
		b.solvedCount - a.solvedCount || a.scoreTimeMs - b.scoreTimeMs || a.wrongCount - b.wrongCount;

	standings.sort((a, b) => compare(a, b) || a.participantId.localeCompare(b.participantId));

	standings.forEach((s, i) => {
		const prev = standings[i - 1];
		s.rank = prev && compare(prev, s) === 0 ? prev.rank : i + 1;
	});

	return standings;
};

export interface PalindromeSolver {
	participantId: string;
	correctAt: number;
	elapsedMs: number;
	hints: HintKind[];
	penaltyMs: number;
	wrongCount: number;
}

export interface PalindromeQuestionSummary {
	/** 正解した順 */
	solvers: PalindromeSolver[];
	/** 最初の正解者 (同時なら複数) */
	firstSolverIds: string[];
	/** 挑戦した (ヒントを開けたか回答した) が正解できなかった人数 */
	unsolvedTriedCount: number;
}

/** 1問ごとの正解者の一覧 (感想戦で使う) */
export const computeQuestionSummary = (
	state: PalindromeState,
	questionId: string,
	participants: Participant[],
): PalindromeQuestionSummary => {
	const startedAt = state.startedAt ?? 0;
	const solvers: PalindromeSolver[] = [];
	let unsolvedTriedCount = 0;
	for (const p of participants) {
		const attempt = state.attempts[questionId]?.[p.id];
		if (!attempt) continue;
		if (attempt.correctAt === null) {
			unsolvedTriedCount += 1;
			continue;
		}
		solvers.push({
			participantId: p.id,
			correctAt: attempt.correctAt,
			elapsedMs: attempt.correctAt - startedAt,
			hints: Object.keys(attempt.hints) as HintKind[],
			penaltyMs: computeQuestionPenalty(attempt.hints),
			wrongCount: attempt.wrong.length,
		});
	}
	solvers.sort(
		(a, b) => a.correctAt - b.correctAt || a.participantId.localeCompare(b.participantId),
	);
	const first = solvers[0]?.correctAt;
	return {
		solvers,
		firstSolverIds: solvers.filter((s) => s.correctAt === first).map((s) => s.participantId),
		unsolvedTriedCount,
	};
};
