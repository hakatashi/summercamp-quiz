import {CommandError} from '../../types.ts';

export const normalizeAnswerText = (text: string): string => text.replace(/\s+/g, '');

const RELAXED_HIRAGANA_MAP: Record<string, string> = {
	// 小書き文字
	ぁ: 'あ',
	ぃ: 'い',
	ぅ: 'う',
	ぇ: 'え',
	ぉ: 'お',
	っ: 'つ',
	ゃ: 'や',
	ゅ: 'ゆ',
	ょ: 'よ',
	ゎ: 'わ',
	ゕ: 'か',
	ゖ: 'け',
	// 濁音
	が: 'か',
	ぎ: 'き',
	ぐ: 'く',
	げ: 'け',
	ご: 'こ',
	ざ: 'さ',
	じ: 'し',
	ず: 'す',
	ぜ: 'せ',
	ぞ: 'そ',
	だ: 'た',
	ぢ: 'ち',
	づ: 'つ',
	で: 'て',
	ど: 'と',
	ば: 'は',
	び: 'ひ',
	ぶ: 'ふ',
	べ: 'へ',
	ぼ: 'ほ',
	ゔ: 'う',
	// 半濁音
	ぱ: 'は',
	ぴ: 'ひ',
	ぷ: 'ふ',
	ぺ: 'へ',
	ぽ: 'ほ',
};

/**
 * 回文判定用に文字を緩める (小書き文字、濁点、半濁点を同一視)。長音「ー」はそのまま。
 */
export const toRelaxedHiragana = (char: string): string => RELAXED_HIRAGANA_MAP[char] ?? char;

/**
 * 緩めた条件 (小書き文字、濁点、半濁点を同一視、長音は省略不可) で回文かどうかを判定する。
 */
export const isPalindromeRelaxed = (text: string): boolean => {
	const chars = [...text].map(toRelaxedHiragana);
	const len = chars.length;
	for (let i = 0; i < Math.floor(len / 2); i++) {
		if (chars[i] !== chars[len - 1 - i]) {
			return false;
		}
	}
	return true;
};

export interface ValidateAnswerOptions {
	answer: string;
	wrongAnswers?: string[];
}

/**
 * 送信前のクライアント側バリデーションやサーバー側チェック用。
 * エラーがあればエラーメッセージを返し、問題なければ null を返す。
 */
export const getAnswerValidationError = (
	rawText: string,
	options: ValidateAnswerOptions,
): string | null => {
	const normalized = normalizeAnswerText(rawText);
	if (normalized === '' || !/^[\u3041-\u3096ー]+$/.test(normalized)) {
		return 'ひらがなで入力してください';
	}
	const currentLength = [...normalized].length;
	const targetLength = [...options.answer].length;
	if (currentLength !== targetLength) {
		return `${targetLength} 文字で入力してください (現在 ${currentLength} 文字)`;
	}
	if (!isPalindromeRelaxed(normalized)) {
		return '回文になっていません';
	}
	if (options.wrongAnswers?.includes(normalized)) {
		return 'その回答はすでに送っています';
	}
	return null;
};

export interface CheckAnswerOptions extends ValidateAnswerOptions {
	altAnswers?: string[];
}

/**
 * 回答を検証し、正解・不正解を判定する。
 * バリデーションエラー時は CommandError を投げる。
 */
export const checkAnswer = (
	rawText: string,
	options: CheckAnswerOptions,
): {correct: boolean; normalized: string} => {
	const error = getAnswerValidationError(rawText, options);
	if (error) {
		throw new CommandError(error);
	}
	const normalized = normalizeAnswerText(rawText);
	const candidates = [options.answer, ...(options.altAnswers ?? [])];
	const correct = candidates.includes(normalized);
	return {correct, normalized};
};
