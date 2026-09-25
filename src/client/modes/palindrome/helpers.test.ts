import {describe, expect, it} from 'vitest';
import type {PalindromeState} from '../../../shared/modes/palindrome/index.ts';
import type {Game, Question} from '../../../shared/types.ts';
import {
	formatClock,
	formatPenalty,
	formatTime,
	getQuestionWarning,
	participantName,
	questionView,
} from './helpers.ts';

describe('palindrome helpers', () => {
	describe('formatTime', () => {
		it('ミリ秒を m:ss.s 形式にフォーマットする', () => {
			expect(formatTime(83400)).toBe('1:23.4');
			expect(formatTime(23450)).toBe('0:23.4');
			expect(formatTime(0)).toBe('0:00.0');
			expect(formatTime(60000)).toBe('1:00.0');
		});

		it('null や無効値の場合は — を返す', () => {
			expect(formatTime(null)).toBe('—');
			expect(formatTime(-100)).toBe('—');
			expect(formatTime(Number.NaN)).toBe('—');
		});
	});

	describe('formatPenalty', () => {
		it('+〇 秒 にフォーマットする', () => {
			expect(formatPenalty(60000)).toBe('+60 秒');
			expect(formatPenalty(20000)).toBe('+20 秒');
			expect(formatPenalty(0)).toBe('+0 秒');
		});
	});

	describe('formatClock', () => {
		it('m:ss 形式、1 時間以上は h:mm:ss 形式にする', () => {
			expect(formatClock(0)).toBe('0:00');
			expect(formatClock(65_900)).toBe('1:05');
			expect(formatClock(30 * 60_000)).toBe('30:00');
			expect(formatClock(3_725_000)).toBe('1:02:05');
			expect(formatClock(-1000)).toBe('0:00');
			expect(formatClock(null)).toBe('—');
		});
	});

	describe('questionView', () => {
		const base: Question = {id: 'q1', text: '', answer: 'とまと', note: '', extra: {}};

		it('司会者向けの生の extra から文字数と文字種ヒントを補う', () => {
			const info = questionView({
				...base,
				extra: {
					image: 'm1',
					notation: 'トマト',
					altAnswers: [],
					hints: {situation: '野菜', irasutoya: 'トマト'},
				},
			});
			expect(info).toEqual({
				image: 'm1',
				charCount: 3,
				notation: 'トマト',
				altAnswers: [],
				hints: {situation: '野菜', irasutoya: 'トマト', charTypes: 'アアア'},
			});
		});

		it('投影済みの extra (答えなし) では charCount を使う', () => {
			const info = questionView({
				...base,
				answer: '',
				extra: {image: 'm1', charCount: 3, hints: {charTypes: 'アアア'}},
			});
			expect(info).toEqual({
				image: 'm1',
				charCount: 3,
				notation: null,
				altAnswers: [],
				hints: {charTypes: 'アアア'},
			});
		});
	});

	describe('participantName', () => {
		it('参加者名を取得する', () => {
			const game = {
				participants: [
					{id: 'p1', name: 'Alice', joinedAt: 1000, kind: 'human'},
					{id: 'p2', name: 'Bot', joinedAt: 1000, kind: 'ai'},
				],
			} as Game<PalindromeState>;

			expect(participantName(game, 'p1')).toBe('Alice');
			expect(participantName(game, 'p2')).toBe('Bot');
			expect(participantName(game, 'p3')).toBe('?');
		});
	});

	describe('getQuestionWarning', () => {
		it('全てのフィールドが揃っていれば null を返す', () => {
			const validQ: Question = {
				id: 'q1',
				text: '',
				answer: 'しんぶんし',
				note: '',
				extra: {
					image: 'img-123',
					notation: '新聞紙',
					hints: {
						situation: 'ニュースが書いてあります',
						irasutoya: '新聞を読んでいる人',
					},
				},
			};
			expect(getQuestionWarning(validQ)).toBeNull();
		});

		it('画像や表記、ヒント、答えが欠けていれば警告を返す', () => {
			const incompleteQ: Question = {
				id: 'q2',
				text: '',
				answer: '',
				note: '',
				extra: {},
			};
			const warning = getQuestionWarning(incompleteQ);
			expect(warning).not.toBeNull();
			expect(warning).toContain('画像');
			expect(warning).toContain('表記');
			expect(warning).toContain('状況ヒント');
			expect(warning).toContain('いらすとやヒント');
			expect(warning).toContain('答え');
		});

		it('答えが回文でない場合に警告を出す', () => {
			const notPalindromeQ: Question = {
				id: 'q3',
				text: '',
				answer: 'りんご',
				note: '',
				extra: {
					image: 'img-123',
					notation: '林檎',
					hints: {
						situation: '果物です',
						irasutoya: 'リンゴのイラスト',
					},
				},
			};
			const warning = getQuestionWarning(notPalindromeQ);
			expect(warning).toContain('答えが回文になっていません');
		});
	});
});
