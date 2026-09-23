import {
	currentRecord,
	type QuestionRecord,
	type SimpleBuzzerState,
	scoreOf,
} from '../../../shared/modes/simple-buzzer/index.ts';
import type {Game, Participant, Question} from '../../../shared/types.ts';

export type SimpleBuzzerGame = Game<SimpleBuzzerState>;

export interface Standing {
	participant: Participant;
	score: number;
	/** 同点は同順位 */
	rank: number;
}

export const standings = (game: SimpleBuzzerGame): Standing[] => {
	const sorted = game.participants
		.map((participant) => ({participant, score: scoreOf(game.state, participant.id)}))
		.sort((a, b) => b.score - a.score || a.participant.joinedAt - b.participant.joinedAt);
	return sorted.map((entry) => ({
		...entry,
		rank: sorted.findIndex((other) => other.score === entry.score) + 1,
	}));
};

export const participantName = (game: SimpleBuzzerGame, participantId: string) =>
	game.participants.find((p) => p.id === participantId)?.name ?? '(退出した参加者)';

export const findQuestion = (game: SimpleBuzzerGame, questionId: string): Question | undefined =>
	game.questions.find((q) => q.id === questionId);

/** 出題中 (読み上げ中・回答中) か */
export const isOpen = (state: SimpleBuzzerState) =>
	state.phase === 'reading' || state.phase === 'answering';

/** 画面に「前の問題」として出す記録 (出題中の問題は除く) */
export const previousRecord = (state: SimpleBuzzerState): QuestionRecord | null => {
	const closed = state.history.filter((r) => r.result !== null);
	return closed.at(-1) ?? null;
};

/** 現在の問題が何問目か (取り消した問題も含めた出題順) */
export const questionNumber = (state: SimpleBuzzerState) => {
	const record = currentRecord(state);
	return record ? state.history.indexOf(record) + 1 : null;
};
