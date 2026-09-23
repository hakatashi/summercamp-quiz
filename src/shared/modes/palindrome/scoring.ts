import type {Participant} from '../../types.ts';
import {HINT_PENALTIES, type HintKind, type PalindromeQuestionRecord} from './types.ts';

export interface PalindromeQuestionStanding {
	rank: number;
	participantId: string;
	correct: boolean;
	correctAt: number | null;
	elapsedMs: number | null;
	penaltyMs: number;
	recordTimeMs: number | null;
	wrongCount: number;
	openedHints: HintKind[];
}

export const computeQuestionPenalty = (hints: Partial<Record<HintKind, number>>): number => {
	let penalty = 0;
	for (const kind of Object.keys(hints) as HintKind[]) {
		penalty += HINT_PENALTIES[kind] ?? 0;
	}
	return penalty;
};

/**
 * 問題ごとの順位を計算する。
 * 正解者を記録時間 (経過時間 + 開けたヒントのペナルティ) の短い順に並べ、同じなら誤答の少ない順。
 * 正解していない人はその後ろに並べる。
 */
export const computeQuestionStandings = (
	record: PalindromeQuestionRecord,
	participants: Participant[],
): PalindromeQuestionStanding[] => {
	const standings: PalindromeQuestionStanding[] = participants.map((p) => {
		const pRec = record.participants[p.id];
		const hints = pRec?.hints ?? {};
		const wrong = pRec?.wrong ?? [];
		const correctAt = pRec?.correctAt ?? null;
		const correct = correctAt !== null;
		const elapsedMs = correct ? correctAt - record.openedAt : null;
		const penaltyMs = computeQuestionPenalty(hints);
		const recordTimeMs = correct && elapsedMs !== null ? elapsedMs + penaltyMs : null;
		const openedHints = Object.keys(hints) as HintKind[];
		return {
			rank: 0,
			participantId: p.id,
			correct,
			correctAt,
			elapsedMs,
			penaltyMs,
			recordTimeMs,
			wrongCount: wrong.length,
			openedHints,
		};
	});

	// ソート: 正解者 (記録時間昇順 → 誤答数昇順 → 正解時刻昇順 → participantId 昇順)
	// 未正解者: 誤答数昇順 → participantId 昇順
	standings.sort((a, b) => {
		if (a.correct && !b.correct) return -1;
		if (!a.correct && b.correct) return 1;
		if (a.correct && b.correct) {
			if (a.recordTimeMs !== b.recordTimeMs) {
				return (a.recordTimeMs ?? 0) - (b.recordTimeMs ?? 0);
			}
			if (a.wrongCount !== b.wrongCount) {
				return a.wrongCount - b.wrongCount;
			}
			if (a.correctAt !== b.correctAt) {
				return (a.correctAt ?? 0) - (b.correctAt ?? 0);
			}
			return a.participantId.localeCompare(b.participantId);
		}
		if (a.wrongCount !== b.wrongCount) {
			return a.wrongCount - b.wrongCount;
		}
		return a.participantId.localeCompare(b.participantId);
	});

	// 順位付け (1, 2, 2, 4...)
	const correctCount = standings.filter((s) => s.correct).length;
	for (let i = 0; i < standings.length; i++) {
		const s = standings[i];
		if (!s) continue;
		if (s.correct) {
			if (i > 0) {
				const prev = standings[i - 1];
				if (
					prev?.correct &&
					prev.recordTimeMs === s.recordTimeMs &&
					prev.wrongCount === s.wrongCount
				) {
					s.rank = prev.rank;
				} else {
					s.rank = i + 1;
				}
			} else {
				s.rank = 1;
			}
		} else {
			s.rank = correctCount + 1;
		}
	}

	return standings;
};

export interface PalindromeOverallStanding {
	rank: number;
	participantId: string;
	correctCount: number;
	totalRecordTimeMs: number;
	totalWrongCount: number;
}

/**
 * 総合順位を計算する。
 * 正解した問題の多い順 → 正解した問題の記録時間の合計の短い順 → 誤答の合計の少ない順。
 */
export const computeOverallStandings = (
	history: PalindromeQuestionRecord[],
	participants: Participant[],
): PalindromeOverallStanding[] => {
	const standings: PalindromeOverallStanding[] = participants.map((p) => {
		let correctCount = 0;
		let totalRecordTimeMs = 0;
		let totalWrongCount = 0;

		for (const record of history) {
			const pRec = record.participants[p.id];
			if (!pRec) continue;
			totalWrongCount += pRec.wrong.length;
			if (pRec.correctAt !== null) {
				correctCount += 1;
				const elapsed = pRec.correctAt - record.openedAt;
				const penalty = computeQuestionPenalty(pRec.hints);
				totalRecordTimeMs += elapsed + penalty;
			}
		}

		return {
			rank: 0,
			participantId: p.id,
			correctCount,
			totalRecordTimeMs,
			totalWrongCount,
		};
	});

	// ソート: 正解数降順 → 総記録時間昇順 → 総誤答数昇順 → participantId 昇順
	standings.sort((a, b) => {
		if (a.correctCount !== b.correctCount) {
			return b.correctCount - a.correctCount;
		}
		if (a.totalRecordTimeMs !== b.totalRecordTimeMs) {
			return a.totalRecordTimeMs - b.totalRecordTimeMs;
		}
		if (a.totalWrongCount !== b.totalWrongCount) {
			return a.totalWrongCount - b.totalWrongCount;
		}
		return a.participantId.localeCompare(b.participantId);
	});

	// 順位付け (1, 2, 2, 4...)
	for (let i = 0; i < standings.length; i++) {
		const s = standings[i];
		if (!s) continue;
		if (i > 0) {
			const prev = standings[i - 1];
			if (
				prev &&
				prev.correctCount === s.correctCount &&
				prev.totalRecordTimeMs === s.totalRecordTimeMs &&
				prev.totalWrongCount === s.totalWrongCount
			) {
				s.rank = prev.rank;
			} else {
				s.rank = i + 1;
			}
		} else {
			s.rank = 1;
		}
	}

	return standings;
};
