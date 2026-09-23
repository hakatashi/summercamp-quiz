import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import type {SimpleBuzzerState} from '../../../shared/modes/simple-buzzer/index.ts';
import type {GameView} from '../../../shared/types.ts';
import {ReviewMonitor} from './ReviewMonitor.tsx';

describe('ReviewMonitor', () => {
	const createGameView = (): GameView<SimpleBuzzerState> => ({
		game: {
			id: 'g1',
			mode: 'simple-buzzer',
			title: 'テスト早押し大会',
			createdAt: 0,
			review: {index: 0},
			participants: [
				{id: 'p1', name: 'アリス', joinedAt: 100},
				{id: 'p2', name: 'ボブ', joinedAt: 200},
				{id: 'p3', name: 'キャロル', joinedAt: 300},
			],
			questions: [
				{
					id: 'q1',
					text: '日本で一番高い山は富士山ですが、世界で一番高い山は何でしょう？',
					answer: 'エベレスト (チョモランマ)',
					note: '標高8848m',
					extra: {},
				},
				{
					id: 'q2',
					text: 'ことわざで「犬も歩けば何に当たる」というでしょう？',
					answer: '棒',
					note: '',
					extra: {},
				},
				{
					id: 'q3',
					text: '元素記号「Au」は何でしょう？',
					answer: '金',
					note: '',
					extra: {},
				},
			],
			state: {
				phase: 'finished',
				scores: {p1: 2, p2: -1, p3: 0},
				history: [
					{
						questionId: 'q1',
						startedAt: 1000,
						endedAt: 3000,
						scoresBefore: {p1: 0, p2: 0, p3: 0},
						buzzes: [
							{
								participantId: 'p1',
								pressedAt: 2200,
								receivedAt: 2210,
								status: 'correct',
							},
						],
						result: 'correct',
					},
					{
						questionId: 'q2',
						startedAt: 4000,
						endedAt: 7000,
						scoresBefore: {p1: 1, p2: 0, p3: 0},
						buzzes: [
							{
								participantId: 'p2',
								pressedAt: 4850,
								receivedAt: 4860,
								status: 'wrong',
							},
							{
								participantId: 'p1',
								pressedAt: 5420,
								receivedAt: 5430,
								status: 'correct',
							},
						],
						result: 'correct',
					},
					{
						questionId: 'q3',
						startedAt: 8000,
						endedAt: 12000,
						scoresBefore: {p1: 2, p2: -1, p3: 0},
						buzzes: [],
						result: 'through',
					},
				],
			},
		},
		version: 1,
		online: ['p1', 'p2', 'p3'],
		questionCount: 3,
		undoable: null,
	});

	it('第1問: 問題文、答え、正解者、出題前得点と増減 (+1) が正しく描画される', () => {
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
		expect(html).toContain('テスト早押し大会');

		// 問題・答え
		expect(html).toContain('日本で一番高い山は富士山ですが、世界で一番高い山は何でしょう？');
		expect(html).toContain('エベレスト (チョモランマ)');

		// 結果と回答者
		expect(html).toContain('正解');
		expect(html).toContain('(アリス)');
		expect(html).toContain('○');
		expect(html).toContain('+1.20秒');

		// 出題時得点と変動
		expect(html).toContain('0 pt');
		expect(html).toContain('+1');
		expect(html).toContain('±0');
	});

	it('第2問: 誤答と正解の両方の履歴と増減 (-1, +1) が正しく描画される', () => {
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

		// ヘッダー
		expect(html).toContain('第 2 問');

		// 問題・答え
		expect(html).toContain('ことわざで「犬も歩けば何に当たる」というでしょう？');
		expect(html).toContain('棒');

		// 早押し履歴: ボブ誤答、アリス正解
		expect(html).toContain('ボブ');
		expect(html).toContain('×');
		expect(html).toContain('+0.85秒');

		expect(html).toContain('アリス');
		expect(html).toContain('○');
		expect(html).toContain('+1.42秒');

		// 得点状況: 出題前得点は アリス 1pt, ボブ 0pt, キャロル 0pt
		expect(html).toContain('1 pt');
		expect(html).toContain('-1');
	});

	it('第3問: スルー時に「回答権を得た参加者はいませんでした」と表示される', () => {
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
		expect(html).toContain('スルー');
		expect(html).toContain('回答権を得た参加者はいませんでした');
	});
});
