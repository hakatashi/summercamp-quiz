import {
	type BuzzerBoardState,
	currentRecord,
	isCleared,
	type QuestionRecord,
	restOf,
	scoreOf,
} from '../../../shared/modes/buzzer-board/index.ts';
import type {Game, Participant, Question} from '../../../shared/types.ts';

export type BuzzerBoardGame = Game<BuzzerBoardState>;

export interface Standing {
	participant: Participant;
	score: number;
	rest: number;
	cleared: boolean;
	streak: number;
	/** 同点は同順位 */
	rank: number;
}

export const standings = (game: BuzzerBoardGame): Standing[] => {
	const sorted = game.participants
		.map((participant) => ({
			participant,
			score: scoreOf(game.state, participant.id),
			rest: restOf(game.state, participant.id),
			cleared: isCleared(game.state, participant.id),
			streak: game.state.streak?.participantId === participant.id ? game.state.streak.count : 0,
		}))
		.sort((a, b) => b.score - a.score || a.participant.joinedAt - b.participant.joinedAt);
	return sorted.map((entry) => ({
		...entry,
		rank: sorted.findIndex((other) => other.score === entry.score) + 1,
	}));
};

export const participantName = (game: BuzzerBoardGame, participantId: string) =>
	game.participants.find((p) => p.id === participantId)?.name ?? '(退出した参加者)';

export const findQuestion = (game: BuzzerBoardGame, questionId: string): Question | undefined =>
	game.questions.find((q) => q.id === questionId);

/** 出題中 (読み上げ中・回答中) か */
export const isOpen = (state: BuzzerBoardState) =>
	state.phase === 'reading' || state.phase === 'answering';

/** 画面に「前の問題」として出す記録 (出題中・ボードクイズ中の問題は除く) */
export const previousRecord = (state: BuzzerBoardState): QuestionRecord | null => {
	const boardOpen = isBoardPhase(state.phase) ? state.history.at(-1) : undefined;
	const closed = state.history.filter((r) => r.result !== null && r !== boardOpen);
	return closed.at(-1) ?? null;
};

/** 現在の問題が何問目か (取り消した問題も含めた出題順) */
export const questionNumber = (state: BuzzerBoardState) => {
	const record = currentRecord(state);
	return record ? state.history.indexOf(record) + 1 : null;
};

export interface ReviewStanding {
	participant: Participant;
	scoreBefore: number;
	scoreDelta: number;
	scoreAfter: number;
	rank: number;
	cleared: boolean;
	rest: number;
	streak: number;
}

/** 感想戦用: その問題が出題された時点の得点状況と増減を計算 */
export const reviewStandings = (
	game: BuzzerBoardGame,
	record: QuestionRecord,
): ReviewStanding[] => {
	const deltas: Record<string, number> = {};
	if (record.board) {
		if (record.board.confirmedAt !== null) {
			for (const [pId, ans] of Object.entries(record.board.answers)) {
				if (ans.correct === true) {
					deltas[pId] = 1;
				}
			}
		}
	} else if (record.result === 'correct') {
		const correctBuzz = record.buzzes.find((b) => b.status === 'correct');
		if (correctBuzz) {
			const base = record.breakdown?.base ?? 1;
			const bonus = record.breakdown?.bonus ?? 0;
			deltas[correctBuzz.participantId] = base + bonus;
		}
	}

	const sorted = game.participants
		.map((participant) => {
			const scoreBefore = record.scoresBefore[participant.id] ?? 0;
			const scoreDelta = deltas[participant.id] ?? 0;
			return {
				participant,
				scoreBefore,
				scoreDelta,
				scoreAfter: scoreBefore + scoreDelta,
				cleared: Boolean(record.clearedBefore[participant.id]),
				rest: record.restBefore[participant.id] ?? 0,
				streak:
					record.streakBefore?.participantId === participant.id ? record.streakBefore.count : 0,
			};
		})
		.sort(
			(a, b) => b.scoreBefore - a.scoreBefore || a.participant.joinedAt - b.participant.joinedAt,
		);

	return sorted.map((entry) => ({
		...entry,
		rank: sorted.findIndex((other) => other.scoreBefore === entry.scoreBefore) + 1,
	}));
};

/** 得点表が縦に収まるよう、人数から行の高さと列数を決める */
export const scoreboardLayout = (count: number, available = 740) => {
	const columns = count > 14 ? 2 : 1;
	const rows = Math.max(1, Math.ceil(count / columns));
	const rowHeight = Math.min(96, Math.floor(available / rows));
	return {columns, rows, rowHeight};
};

/**
 * ボードクイズの参加者リストが枠内に収まるよう、人数から列数と行の高さを決める。
 * 最大列数でも収まらないときは最小の高さにして、リスト側をスクロールさせる
 */
export const boardListLayout = (
	count: number,
	available: number,
	{maxColumns = 3, minRowHeight = 24, maxRowHeight = 52} = {},
) => {
	const measure = (columns: number, gap: number) => {
		const rows = Math.max(1, Math.ceil(count / columns));
		return {columns, rows, gap, rowHeight: Math.floor((available - gap * (rows - 1)) / rows)};
	};
	let layout = measure(1, 8);
	for (let columns = 2; columns <= maxColumns && layout.rowHeight < 40; columns++) {
		layout = measure(columns, 8);
	}
	// 最大列数でも窮屈なら行間を詰める
	if (layout.rowHeight < 40) {
		layout = measure(layout.columns, 4);
	}
	const rowHeight = Math.max(minRowHeight, Math.min(maxRowHeight, layout.rowHeight));
	return {...layout, rowHeight, fontSize: Math.round(rowHeight * 0.5)};
};

/** 問題文の長さに応じて文字の大きさを変える */
export const questionFontSize = (text: string) =>
	text.length > 150 ? 30 : text.length > 100 ? 36 : text.length > 60 ? 42 : 48;

/** ボードクイズ中 (回答受付中・判定中) か */
export const isBoardPhase = (phase: string) =>
	phase === 'board-answering' || phase === 'board-judging';

/** 前後の空白と全角半角を正規化して回答文を比べるための正規化 */
export const normalizeAnswer = (text: string) => text.trim().normalize('NFKC').toLowerCase();
