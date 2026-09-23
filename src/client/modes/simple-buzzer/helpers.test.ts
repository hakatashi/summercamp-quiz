import {describe, expect, it} from 'vitest';
import type {QuestionRecord, SimpleBuzzerState} from '../../../shared/modes/simple-buzzer/index.ts';
import type {Game, Participant} from '../../../shared/types.ts';
import {questionFontSize, reviewStandings, scoreboardLayout} from './helpers.ts';

const createParticipant = (id: string, name: string, joinedAt: number): Participant => ({
	id,
	name,
	joinedAt,
	kind: 'human',
});

describe('simple-buzzer client helpers', () => {
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

	it('reviewStandings は出題前得点で順位を付け、その問題での増減を正しく計算する', () => {
		const participants: Participant[] = [
			createParticipant('p1', 'Alice', 100),
			createParticipant('p2', 'Bob', 200),
			createParticipant('p3', 'Carol', 300),
			createParticipant('p4', 'Dave', 400),
		];

		const game: Game<SimpleBuzzerState> = {
			id: 'g1',
			mode: 'simple-buzzer',
			title: 'テスト',
			createdAt: 0,
			participants,
			questions: [],
			state: {
				phase: 'waiting',
				scores: {},
				history: [],
			},
			review: null,
		};

		const record: QuestionRecord = {
			questionId: 'q1',
			startedAt: 1000,
			endedAt: 2000,
			scoresBefore: {
				p1: 2,
				p2: 5,
				p3: 2,
				// p4 は scoresBefore に記録されていない (遅れて参加など)
			},
			buzzes: [
				{
					participantId: 'p1',
					pressedAt: 1200,
					receivedAt: 1210,
					status: 'wrong',
				},
				{
					participantId: 'p3',
					pressedAt: 1500,
					receivedAt: 1510,
					status: 'correct',
				},
				{
					participantId: 'p2',
					pressedAt: 1800,
					receivedAt: 1810,
					status: 'void',
				},
			],
			result: 'correct',
		};

		const result = reviewStandings(game, record);

		// Bob (5pt, rank 1), Alice (2pt, rank 2), Carol (2pt, rank 2), Dave (0pt, rank 4)
		// AliceとCarolは同点 (2pt)。joinedAt順でAlice(100)がCarol(300)より先。
		expect(result).toHaveLength(4);

		expect(result[0]).toEqual({
			participant: participants[1], // Bob
			scoreBefore: 5,
			scoreDelta: 0, // void なので 0
			scoreAfter: 5,
			rank: 1,
		});

		expect(result[1]).toEqual({
			participant: participants[0], // Alice
			scoreBefore: 2,
			scoreDelta: -1, // wrong なので -1
			scoreAfter: 1,
			rank: 2,
		});

		expect(result[2]).toEqual({
			participant: participants[2], // Carol
			scoreBefore: 2,
			scoreDelta: 1, // correct なので +1
			scoreAfter: 3,
			rank: 2,
		});

		expect(result[3]).toEqual({
			participant: participants[3], // Dave
			scoreBefore: 0,
			scoreDelta: 0,
			scoreAfter: 0,
			rank: 4,
		});
	});
});
