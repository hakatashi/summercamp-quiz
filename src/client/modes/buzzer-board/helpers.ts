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

/** 画面に「前の問題」として出す記録 (出題中の問題は除く) */
export const previousRecord = (state: BuzzerBoardState): QuestionRecord | null => {
	const closed = state.history.filter((r) => r.result !== null);
	return closed.at(-1) ?? null;
};

/** 現在の問題が何問目か (取り消した問題も含めた出題順) */
export const questionNumber = (state: BuzzerBoardState) => {
	const record = currentRecord(state);
	return record ? state.history.indexOf(record) + 1 : null;
};

/** 得点表が縦に収まるよう、人数から行の高さと列数を決める */
export const scoreboardLayout = (count: number, available = 860) => {
	const columns = count > 14 ? 2 : 1;
	const rows = Math.max(1, Math.ceil(count / columns));
	const rowHeight = Math.min(96, Math.floor(available / rows));
	return {columns, rows, rowHeight};
};

/** 問題文の長さに応じて文字の大きさを変える */
export const questionFontSize = (text: string) =>
	text.length > 150 ? 30 : text.length > 100 ? 36 : text.length > 60 ? 42 : 48;
