import {describe, expect, it} from 'vitest';
import {applyCommand, createGame, fillCommandIds} from './engine.ts';
import {getExportFileName, parseQuestionsJson} from './questionsJson.ts';
import type {Question} from './types.ts';

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

describe('JSON エクスポートとインポートの往復', () => {
	it('エクスポートした JSON を別のゲームに取り込める (往復して内容が一致する)', () => {
		const sourceQuestions: Question[] = [
			{
				id: 'old-q1',
				text: '日本の首都は?',
				answer: '東京',
				note: 'とうきょう',
				extra: {},
			},
			{
				id: 'old-q2',
				text: '世界で一番高い山は?',
				answer: 'エベレスト',
				note: '',
				extra: {},
			},
		];

		// エクスポート (game.questions をそのまま JSON 化)
		const exportedJson = JSON.stringify(sourceQuestions, null, 2);

		// インポート (parseQuestionsJson でパース)
		const importedInputs = parseQuestionsJson(exportedJson);

		// パース結果が元の questions のプロパティ (id 以外) と一致すること
		expect(importedInputs).toEqual(sourceQuestions.map(({id: _id, ...rest}) => rest));

		// 別のゲームを作成して取り込む
		let destGame = createGame({
			id: 'dest-game',
			mode: 'simple-buzzer',
			title: '別ゲーム',
			createdAt: 1000,
		});

		let idCount = 0;
		const command = fillCommandIds(
			{type: 'questions.import', questions: importedInputs, replace: false},
			() => `new-id-${++idCount}`,
		);

		destGame = applyCommand(destGame, command, {now: 2000, actor: {role: 'host'}});

		expect(destGame.questions).toHaveLength(2);
		// 新しい ID が振られ、既存の ID は引き継がれない
		expect(destGame.questions[0]?.id).not.toBe('old-q1');
		expect(destGame.questions[1]?.id).not.toBe('old-q2');

		// ID 以外の内容が完全に一致する
		expect(destGame.questions.map(({id: _id, ...rest}) => rest)).toEqual(
			sourceQuestions.map(({id: _id, ...rest}) => rest),
		);
	});

	it('パースした extra はそのまま保持される', () => {
		const json = JSON.stringify([
			{
				text: 'Q1',
				answer: 'A1',
				note: 'N1',
				extra: {genre: 'アニメ', points: 10},
			},
		]);
		const [parsed] = parseQuestionsJson(json);
		expect(parsed?.extra).toEqual({genre: 'アニメ', points: 10});
	});
});
