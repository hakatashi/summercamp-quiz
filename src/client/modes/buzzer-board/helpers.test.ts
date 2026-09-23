import {describe, expect, it} from 'vitest';
import type {BuzzerBoardState} from '../../../shared/modes/buzzer-board/index.ts';
import type {Game, Participant} from '../../../shared/types.ts';
import {
	isOpen,
	normalizeAnswer,
	participantName,
	questionFontSize,
	scoreboardLayout,
	standings,
} from './helpers.ts';

const createParticipant = (id: string, name: string, joinedAt: number): Participant => ({
	id,
	name,
	joinedAt,
});

describe('buzzer-board client helpers', () => {
	it('scoreboardLayout は人数に応じて列数と行の高さを計算する', () => {
		const layout10 = scoreboardLayout(10);
		expect(layout10.columns).toBe(1);
		expect(layout10.rows).toBe(10);
		expect(layout10.rowHeight).toBe(86);

		const layout20 = scoreboardLayout(20);
		expect(layout20.columns).toBe(2);
		expect(layout20.rows).toBe(10);
		expect(layout20.rowHeight).toBe(86);
	});

	it('questionFontSize は問題文の長さに応じて文字サイズを返す', () => {
		expect(questionFontSize('短い問題')).toBe(48);
		expect(questionFontSize('a'.repeat(70))).toBe(42);
		expect(questionFontSize('a'.repeat(110))).toBe(36);
		expect(questionFontSize('a'.repeat(160))).toBe(30);
	});

	it('standings はスコア順に順位付けし同点は同順位とする', () => {
		const participants: Participant[] = [
			createParticipant('p1', 'Alice', 100),
			createParticipant('p2', 'Bob', 200),
			createParticipant('p3', 'Carol', 300),
		];
		const game: Game<BuzzerBoardState> = {
			id: 'g1',
			mode: 'buzzer-board',
			title: 'テスト',
			createdAt: 0,
			participants,
			questions: [],
			state: {
				phase: 'waiting',
				scores: {p1: 3, p2: 5, p3: 3},
				rest: {p1: 1},
				cleared: {p2: true},
				streak: {participantId: 'p2', count: 2},
				nextGenre: {genre: 'ノンジャンル', chosenBy: null},
				genreChooser: null,
				history: [],
				unaskedCounts: {
					ノンジャンル: 0,
					スポーツ: 0,
					世界史: 0,
					公民: 0,
					地理: 0,
					文学: 0,
					日本史: 0,
					'漫画・アニメ・ゲーム': 0,
					生活: 0,
					科学: 0,
					芸能: 0,
					芸術: 0,
					言葉: 0,
				},
			},
			review: null,
		};

		const ranking = standings(game);
		expect(ranking).toHaveLength(3);
		// Bob (5pt, rank 1)
		expect(ranking[0]?.participant.name).toBe('Bob');
		expect(ranking[0]?.rank).toBe(1);
		expect(ranking[0]?.cleared).toBe(true);
		expect(ranking[0]?.streak).toBe(2);

		// Alice (3pt, rank 2)
		expect(ranking[1]?.participant.name).toBe('Alice');
		expect(ranking[1]?.rank).toBe(2);
		expect(ranking[1]?.rest).toBe(1);

		// Carol (3pt, rank 2)
		expect(ranking[2]?.participant.name).toBe('Carol');
		expect(ranking[2]?.rank).toBe(2);
	});

	it('isOpen は reading と answering で true を返す', () => {
		const baseState: BuzzerBoardState = {
			phase: 'reading',
			scores: {},
			rest: {},
			cleared: {},
			streak: null,
			nextGenre: {genre: 'ノンジャンル', chosenBy: null},
			genreChooser: null,
			history: [],
			unaskedCounts: {
				ノンジャンル: 0,
				スポーツ: 0,
				世界史: 0,
				公民: 0,
				地理: 0,
				文学: 0,
				日本史: 0,
				'漫画・アニメ・ゲーム': 0,
				生活: 0,
				科学: 0,
				芸能: 0,
				芸術: 0,
				言葉: 0,
			},
		};
		expect(isOpen(baseState)).toBe(true);
		expect(isOpen({...baseState, phase: 'answering'})).toBe(true);
		expect(isOpen({...baseState, phase: 'closed'})).toBe(false);
		expect(isOpen({...baseState, phase: 'waiting'})).toBe(false);
	});

	it('participantName は存在しない参加者には (退出した参加者) を返す', () => {
		const game: Game<BuzzerBoardState> = {
			id: 'g1',
			mode: 'buzzer-board',
			title: 'テスト',
			createdAt: 0,
			participants: [createParticipant('p1', 'Alice', 100)],
			questions: [],
			state: {} as BuzzerBoardState,
			review: null,
		};
		expect(participantName(game, 'p1')).toBe('Alice');
		expect(participantName(game, 'unknown')).toBe('(退出した参加者)');
	});

	it('normalizeAnswer は前後の空白と全角半角、大文字小文字を正規化する', () => {
		expect(normalizeAnswer('  東京タワー  ')).toBe('東京タワー');
		expect(normalizeAnswer('ＡＢＣ')).toBe('abc');
		expect(normalizeAnswer('abc')).toBe('abc');
		expect(normalizeAnswer('ｱｲｳｴｵ')).toBe('アイウエオ');
		expect(normalizeAnswer('アイウエオ')).toBe('アイウエオ');
		expect(normalizeAnswer(' １２３ ')).toBe('123');
	});
});
