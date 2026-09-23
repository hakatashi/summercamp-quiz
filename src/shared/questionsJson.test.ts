import {describe, expect, it} from 'vitest';
import {getExportFileName, parseQuestionsJson} from './questionsJson.ts';

describe('parseQuestionsJson', () => {
	it('有効な JSON 配列をパースし、id を除去して返す', () => {
		const json = JSON.stringify([
			{
				id: 'q1',
				text: '日本の首都は?',
				answer: '東京',
				note: 'とうきょう',
				extra: {genre: '地理'},
			},
			{
				id: 'q2',
				text: '世界で一番高い山は?',
				answer: 'エベレスト',
			},
		]);

		const result = parseQuestionsJson(json);
		expect(result).toEqual([
			{
				text: '日本の首都は?',
				answer: '東京',
				note: 'とうきょう',
				extra: {genre: '地理'},
			},
			{
				text: '世界で一番高い山は?',
				answer: 'エベレスト',
				note: '',
				extra: {},
			},
		]);
	});

	it('空配列を正しくパースする', () => {
		expect(parseQuestionsJson('[]')).toEqual([]);
	});

	it('JSON の構文エラーで例外を投げる', () => {
		expect(() => parseQuestionsJson('{invalid json')).toThrow('JSON の形式が不正です');
	});

	it('配列でない場合 (オブジェクトなど) は例外を投げる', () => {
		expect(() => parseQuestionsJson('{"text": "hoge"}')).toThrow('問題データの形式が不正です');
	});

	it('必須プロパティ (text, answer) が欠けている場合は例外を投げる', () => {
		expect(() => parseQuestionsJson(JSON.stringify([{text: '問題文のみ'}]))).toThrow(
			'問題データの形式が不正です',
		);
	});
});

describe('getExportFileName', () => {
	it('ゲームタイトルと日時からファイル名を生成する', () => {
		const date = new Date(2026, 8, 24, 15, 30);
		expect(getExportFileName('夏合宿クイズ', date)).toBe(
			'夏合宿クイズ-questions-20260924-1530.json',
		);
	});

	it('ファイル名に使えない文字を置換する', () => {
		const date = new Date(2026, 8, 24, 9, 5);
		expect(getExportFileName('Special/Quiz:Part?1', date)).toBe(
			'Special_Quiz_Part_1-questions-20260924-0905.json',
		);
	});
});
