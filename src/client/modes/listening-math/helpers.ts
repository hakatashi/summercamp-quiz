import type {Question} from '../../../shared/types.ts';

export const audioOf = (question: Question | undefined): string =>
	typeof question?.extra.audio === 'string' ? question.extra.audio : '';

export const stringExtra = (question: Question | undefined, key: 'explanation' | 'source') => {
	const value = question?.extra[key];
	return typeof value === 'string' ? value : '';
};

/** 問題一覧の警告 */
export const getQuestionWarning = (question: Question): string | null =>
	audioOf(question) ? null : '音声が未登録です';

/** 問題文の長さに応じた文字サイズ (px) */
export const questionFontSize = (text: string) => {
	const length = [...text].length;
	if (length <= 60) return 52;
	if (length <= 120) return 44;
	if (length <= 200) return 36;
	return 30;
};

/** 解説の長さ (行数を含む) に応じた文字サイズ (px) */
export const explanationFontSize = (text: string) => {
	const lines = text.split('\n').length;
	const weight = [...text].length + lines * 30;
	if (weight <= 160) return 44;
	if (weight <= 320) return 38;
	if (weight <= 520) return 32;
	return 27;
};

/** 秒を "m:ss" に。音声の長さは切り上げ、経過時間は切り捨てて表示する */
export const formatSeconds = (seconds: number, round: 'floor' | 'ceil' = 'floor') => {
	const total = Math.max(0, Math[round](seconds - (round === 'ceil' ? 0.05 : 0)));
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
