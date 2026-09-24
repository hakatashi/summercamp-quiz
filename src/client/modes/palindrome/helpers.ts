import {
	currentRecord,
	type PalindromeQuestionExtra,
	type PalindromeState,
} from '../../../shared/modes/palindrome/index.ts';
import {
	isPalindromeRelaxed,
	normalizeAnswerText,
} from '../../../shared/modes/palindrome/validation.ts';
import type {Game, Question} from '../../../shared/types.ts';

/**
 * ミリ秒を "m:ss.s" 形式 (例: "1:23.4") にフォーマットする。
 */
export const formatTime = (ms: number | null): string => {
	if (ms === null || ms < 0 || Number.isNaN(ms)) {
		return '—';
	}
	const totalSeconds = ms / 1000;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = Math.floor(totalSeconds % 60);
	const tenths = Math.floor((ms % 1000) / 100);
	return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
};

/**
 * ペナルティミリ秒を "+〇 秒" (例: "+60 秒") にフォーマットする。
 */
export const formatPenalty = (penaltyMs: number): string => {
	const seconds = Math.round(penaltyMs / 1000);
	return `+${seconds} 秒`;
};

export const findQuestion = (
	game: Game<PalindromeState>,
	questionId: string,
): Question | undefined => game.questions.find((q) => q.id === questionId);

export const currentQuestion = (game: Game<PalindromeState>): Question | undefined => {
	const record = currentRecord(game.state);
	return record ? findQuestion(game, record.questionId) : undefined;
};

export const questionNumber = (state: PalindromeState): number => state.history.length;

export const isOpen = (state: PalindromeState): boolean => state.phase === 'open';

export const participantName = (game: Game<PalindromeState>, participantId: string): string => {
	const p = game.participants.find((item) => item.id === participantId);
	return p ? p.name : '?';
};

/**
 * 問題一覧表示用の警告メッセージを生成する。
 * 画像、表記、ヒント、答えの不備を検知する。
 */
export const getQuestionWarning = (question: Question): string | null => {
	const missing: string[] = [];
	const extra = (question.extra ?? {}) as Partial<PalindromeQuestionExtra>;

	if (!extra.image || String(extra.image).trim() === '') {
		missing.push('画像');
	}
	if (!extra.notation || String(extra.notation).trim() === '') {
		missing.push('表記');
	}
	const hints = (extra.hints ?? {}) as Partial<PalindromeQuestionExtra['hints']>;
	if (!hints.situation || String(hints.situation).trim() === '') {
		missing.push('状況ヒント');
	}
	if (!hints.irasutoya || String(hints.irasutoya).trim() === '') {
		missing.push('いらすとやヒント');
	}

	const answer = normalizeAnswerText(question.answer ?? '');
	if (!answer) {
		missing.push('答え');
	} else if (!isPalindromeRelaxed(answer)) {
		missing.push('答えが回文になっていません');
	}

	if (missing.length === 0) {
		return null;
	}

	return `${missing.join('・')}が未設定または不正です`;
};
