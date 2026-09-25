import {describe, expect, it} from 'vitest';
import {generateCharTypes, getCharTypesHint} from './charTypes.ts';
import {
	checkAnswer,
	getAnswerValidationError,
	isPalindromeRelaxed,
	normalizeAnswerText,
	toRelaxedHiragana,
} from './validation.ts';

describe('palindrome mode - validation', () => {
	it('normalizeAnswerText は空白をすべて除去する', () => {
		expect(normalizeAnswerText(' まくら　から くま ')).toBe('まくらからくま');
	});

	it('toRelaxedHiragana は小書き文字、濁点、半濁点を正規化する', () => {
		// 小書き文字
		expect(toRelaxedHiragana('ゃ')).toBe('や');
		expect(toRelaxedHiragana('っ')).toBe('つ');
		expect(toRelaxedHiragana('ぁ')).toBe('あ');
		// 濁点
		expect(toRelaxedHiragana('が')).toBe('か');
		expect(toRelaxedHiragana('ざ')).toBe('さ');
		expect(toRelaxedHiragana('だ')).toBe('た');
		expect(toRelaxedHiragana('ば')).toBe('は');
		expect(toRelaxedHiragana('づ')).toBe('つ');
		expect(toRelaxedHiragana('ぢ')).toBe('ち');
		expect(toRelaxedHiragana('ゔ')).toBe('う');
		// 半濁点
		expect(toRelaxedHiragana('ぱ')).toBe('は');
		expect(toRelaxedHiragana('ぴ')).toBe('ひ');
		// 通常文字・長音
		expect(toRelaxedHiragana('あ')).toBe('あ');
		expect(toRelaxedHiragana('ー')).toBe('ー');
	});

	it('isPalindromeRelaxed は緩和条件で回文を判定する', () => {
		// 完全一致の回文 (奇数・偶数文字)
		expect(isPalindromeRelaxed('とまと')).toBe(true); // 3文字 (奇数)
		expect(isPalindromeRelaxed('たいいた')).toBe(true); // 4文字 (偶数)
		expect(isPalindromeRelaxed('まくらからくま')).toBe(true); // 7文字 (奇数)

		// 小書き文字の同一視 (き・ゃ・つ・や・き)
		expect(isPalindromeRelaxed('きやつやき')).toBe(true);
		// 濁点の同一視 (あさひざあ → あさひさあ)
		expect(isPalindromeRelaxed('あさひざあ')).toBe(true);
		// 半濁点の同一視 (ぱんつつんは → はんつつんは)
		expect(isPalindromeRelaxed('ぱんつつんは')).toBe(true);

		// 長音「ー」は省略とみなせない
		expect(isPalindromeRelaxed('びーるるーひ')).toBe(true); // 対称に「ー」がある
		expect(isPalindromeRelaxed('びーるるひ')).toBe(false); // 長音の省略は不可

		// 回文でない
		expect(isPalindromeRelaxed('あいうえお')).toBe(false);
		expect(isPalindromeRelaxed('しるしる')).toBe(false);
	});

	it('getAnswerValidationError は要件通りのメッセージを返す', () => {
		const answer = 'まくらからくま'; // 7文字

		// 空文字・ひらがな以外
		expect(getAnswerValidationError('', {answer})).toBe('ひらがなで入力してください');
		expect(getAnswerValidationError('枕から熊', {answer})).toBe('ひらがなで入力してください');
		expect(getAnswerValidationError('マクラからクマ', {answer})).toBe('ひらがなで入力してください');
		expect(getAnswerValidationError('makurakarakuma', {answer})).toBe('ひらがなで入力してください');

		// 文字数違い (短い・長い)
		expect(getAnswerValidationError('まくらくま', {answer})).toBe(
			'7 文字で入力してください (現在 5 文字)',
		);
		expect(getAnswerValidationError('まくらからからくま', {answer})).toBe(
			'7 文字で入力してください (現在 9 文字)',
		);

		// 回文でない
		expect(getAnswerValidationError('あいうえおかき', {answer})).toBe('回文になっていません');

		// すでに送った誤答
		expect(
			getAnswerValidationError('たいこいこいた', {
				answer,
				wrongAnswers: ['たいこいこいた'],
			}),
		).toBe('その回答はすでに送っています');

		// バリデーション通過
		expect(getAnswerValidationError('まくらからくま', {answer})).toBeNull();
		expect(getAnswerValidationError('たいこいこいた', {answer})).toBeNull();
	});

	it('checkAnswer は想定解および別解との完全一致で正誤判定を行う', () => {
		const options = {
			answer: 'まくらからくま',
			altAnswers: ['まくらはらくま'],
		};

		// 想定解
		expect(checkAnswer(' まくらからくま ', options)).toEqual({
			correct: true,
			normalized: 'まくらからくま',
		});

		// 別解
		expect(
			checkAnswer('まくらはらくま', {
				answer: 'まくらからくま',
				altAnswers: ['まくらはらくま'],
			}),
		).toEqual({
			correct: true,
			normalized: 'まくらはらくま',
		});

		// 回文だが正解ではない誤答
		expect(checkAnswer('たいこいこいた', options)).toEqual({
			correct: false,
			normalized: 'たいこいこいた',
		});

		// バリデーションエラー時は CommandError を投げる
		expect(() => checkAnswer('まくら', options)).toThrowError(
			'7 文字で入力してください (現在 3 文字)',
		);
		expect(() => checkAnswer('枕から熊', options)).toThrowError('ひらがなで入力してください');
	});
});

describe('palindrome mode - charTypes', () => {
	it('generateCharTypes は自然表記から文字種文字列を正しく生成する', () => {
		expect(generateCharTypes('枕から熊')).toBe('漢ああ漢');
		expect(generateCharTypes('トマト')).toBe('アアア');
		expect(generateCharTypes('しんぶんし')).toBe('あああああ');
		expect(generateCharTypes('UFO')).toBe('AAA');
		expect(generateCharTypes('ラーメン')).toBe('アアアア');
		expect(generateCharTypes('スキー場')).toBe('アアア漢');
		expect(generateCharTypes('すーぱー')).toBe('ああああ');
	});

	it('getCharTypesHint は手動指定を優先する', () => {
		expect(getCharTypesHint('枕から熊', '漢ああ漢')).toBe('漢ああ漢');
		expect(getCharTypesHint('トマト', undefined)).toBe('アアア');
		expect(getCharTypesHint('トマト', '')).toBe('アアア');
	});
});
