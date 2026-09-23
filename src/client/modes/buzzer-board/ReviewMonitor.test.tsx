import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import type {BuzzerBoardState} from '../../../shared/modes/buzzer-board/index.ts';
import type {GameView} from '../../../shared/types.ts';
import {ReviewMonitor} from './ReviewMonitor.tsx';

describe('ReviewMonitor (buzzer-board)', () => {
	const createGameView = (): GameView<BuzzerBoardState> => ({
		game: {
			id: 'g1',
			mode: 'buzzer-board',
			title: 'テスト早押しボード大会',
			createdAt: 0,
			review: {index: 0},
			participants: [
				{id: 'p1', name: 'アリス', joinedAt: 100, kind: 'human'},
				{id: 'p2', name: 'ボブ', joinedAt: 200, kind: 'human'},
				{id: 'p3', name: 'キャロル', joinedAt: 300, kind: 'human'},
			],
			questions: [
				{
					id: 'q1',
					text: '日本で一番高い山は富士山ですが、世界で一番高い山は何でしょう？',
					answer: 'エベレスト (チョモランマ)',
					note: '標高8848m',
					extra: {genre: '地理'},
				},
				{
					id: 'q2',
					text: '元素記号「Au」は何でしょう？',
					answer: '金',
					note: '',
					extra: {genre: '科学'},
				},
				{
					id: 'q3',
					text: 'ことわざで「犬も歩けば何に当たる」というでしょう？',
					answer: '棒',
					note: '',
					extra: {genre: '言葉'},
				},
			],
			state: {
				phase: 'finished',
				scores: {p1: 5, p2: 5, p3: 2},
				rest: {},
				cleared: {p1: true, p2: true},
				streak: null,
				nextGenre: {genre: 'ノンジャンル', chosenBy: null},
				genreChooser: null,
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
				history: [
					{
						questionId: 'q1',
						startedAt: 1000,
						endedAt: 3000,
						genre: '地理',
						scoresBefore: {p1: 2, p2: 1, p3: 0},
						restBefore: {p3: 1},
						clearedBefore: {},
						streakBefore: {participantId: 'p1', count: 1},
						nextGenreBefore: {genre: '地理', chosenBy: null},
						genreChooserBefore: null,
						buzzes: [
							{
								participantId: 'p1',
								pressedAt: 2200,
								receivedAt: 2210,
								status: 'correct',
							},
						],
						result: 'correct',
						breakdown: {base: 1, bonus: 1},
						board: null,
					},
					{
						questionId: 'q2',
						startedAt: 4000,
						endedAt: 7000,
						genre: '科学',
						scoresBefore: {p1: 5, p2: 5, p3: 2},
						restBefore: {},
						clearedBefore: {p1: true, p2: true},
						streakBefore: null,
						nextGenreBefore: {genre: '科学', chosenBy: null},
						genreChooserBefore: null,
						buzzes: [],
						result: 'correct',
						breakdown: null,
						board: {
							answers: {
								p1: {participantId: 'p1', text: '金', submittedAt: 5000, correct: true},
								p2: {participantId: 'p2', text: '銀', submittedAt: 5200, correct: false},
							},
							closedAt: 6000,
							confirmedAt: 6500,
						},
					},
					{
						questionId: 'q3',
						startedAt: 8000,
						endedAt: 12000,
						genre: '言葉',
						scoresBefore: {p1: 5, p2: 5, p3: 2},
						restBefore: {},
						clearedBefore: {p1: true, p2: true},
						streakBefore: null,
						nextGenreBefore: {genre: '言葉', chosenBy: null},
						genreChooserBefore: null,
						buzzes: [],
						result: 'through',
						breakdown: null,
						board: null,
					},
				],
			},
		},
		version: 1,
		online: ['p1', 'p2', 'p3'],
		questionCount: 3,
		undoable: null,
	});

	it('第1問 (早押し): 問題文、答え、ジャンル、正解者、出題前得点と増減 (+2, 連答ボーナス) が正しく描画される', () => {
		const view = createGameView();
		const html = renderToStaticMarkup(
			<ReviewMonitor
				view={view}
				connected={true}
				error={null}
				participantId={null}
				item={{questionId: 'q1', recordIndex: 0}}
				index={0}
				total={3}
				send={async () => {}}
				undo={async () => ''}
			/>,
		);

		// ヘッダー
		expect(html).toContain('第 1 問');
		expect(html).toContain('第 1 問 / 全 3 問');
		expect(html).toContain('テスト早押しボード大会');

		// ジャンル
		expect(html).toContain('地理');

		// 問題・答え
		expect(html).toContain('日本で一番高い山は富士山ですが、世界で一番高い山は何でしょう？');
		expect(html).toContain('エベレスト (チョモランマ)');

		// 結果と回答者
		expect(html).toContain('正解');
		expect(html).toContain('(アリス)');
		expect(html).toContain('○');
		expect(html).toContain('+1.20秒');
		expect(html).toContain('正解 +1 / 連答ボーナス +1');

		// 出題時得点と変動
		expect(html).toContain('2 pt');
		expect(html).toContain('+2');
		expect(html).toContain('休1');
		expect(html).toContain('連答中');
	});

	it('第2問 (ボードクイズ): ジャンル、各回答者の回答と判定 (○/×)、得点増減 (+1) が正しく描画される', () => {
		const view = createGameView();
		const html = renderToStaticMarkup(
			<ReviewMonitor
				view={view}
				connected={true}
				error={null}
				participantId={null}
				item={{questionId: 'q2', recordIndex: 1}}
				index={1}
				total={3}
				send={async () => {}}
				undo={async () => ''}
			/>,
		);

		// ヘッダー・ジャンル
		expect(html).toContain('第 2 問');
		expect(html).toContain('科学');

		// 問題・答え
		expect(html).toContain('元素記号「Au」は何でしょう？');
		expect(html).toContain('金');

		// ボードクイズ結果表示
		expect(html).toContain('ボードクイズ');
		expect(html).toContain('アリス');
		expect(html).toContain('金');
		expect(html).toContain('ボブ');
		expect(html).toContain('銀');
		expect(html).toContain('+1');
		expect(html).toContain('±0');

		// 出題前ステータス (勝抜)
		expect(html).toContain('勝抜');
	});

	it('第3問 (スルー): スルー時に「回答権を得た参加者はいませんでした」と表示される', () => {
		const view = createGameView();
		const html = renderToStaticMarkup(
			<ReviewMonitor
				view={view}
				connected={true}
				error={null}
				participantId={null}
				item={{questionId: 'q3', recordIndex: 2}}
				index={2}
				total={3}
				send={async () => {}}
				undo={async () => ''}
			/>,
		);

		expect(html).toContain('第 3 問');
		expect(html).toContain('言葉');
		expect(html).toContain('スルー');
		expect(html).toContain('回答権を得た参加者はいませんでした');
	});
});
