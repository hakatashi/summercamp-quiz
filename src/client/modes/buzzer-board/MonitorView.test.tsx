import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {
	type BoardAnswer,
	type BuzzerBoardState,
	GENRES,
	type Genre,
	type Phase,
} from '../../../shared/modes/buzzer-board/index.ts';
import type {GameView, Participant} from '../../../shared/types.ts';
import {MonitorView} from './MonitorView.tsx';

const baseProps = {
	connected: true,
	error: null,
	participantId: null,
	send: async () => {},
	undo: async () => '',
};

const createView = (
	phase: Phase,
	answers: Record<string, BoardAnswer>,
	participantCount = 3,
	confirmedAt: number | null = null,
): GameView<BuzzerBoardState> => {
	const participants: Participant[] = Array.from({length: participantCount}, (_, i) => ({
		id: `p${i + 1}`,
		name: `参加者${i + 1}`,
		joinedAt: 100 + i,
		kind: 'human',
	}));
	const cleared = Object.fromEntries(participants.map((p) => [p.id, true]));
	return {
		game: {
			id: 'g1',
			mode: 'buzzer-board',
			title: 'ボードクイズ確認',
			createdAt: 0,
			review: null,
			participants,
			// モニターへの投影では、ボードクイズ中の問題は答えを空にして届く
			questions: [
				{
					id: 'q1',
					text: '読み上げ済みの問題文です',
					answer: confirmedAt === null ? '' : '問題の答え',
					note: '',
					extra: {genre: '文学'},
				},
			],
			state: {
				phase,
				scores: {},
				rest: {},
				cleared,
				streak: null,
				nextGenre: {genre: '文学', chosenBy: null},
				genreChooser: null,
				unaskedCounts: Object.fromEntries(GENRES.map((g) => [g, 1])) as Record<Genre, number>,
				history: [
					{
						questionId: 'q1',
						startedAt: 1000,
						endedAt: confirmedAt,
						genre: '文学',
						scoresBefore: {},
						restBefore: {},
						clearedBefore: cleared,
						streakBefore: null,
						nextGenreBefore: {genre: '文学', chosenBy: null},
						genreChooserBefore: null,
						buzzes: [],
						result: 'through',
						breakdown: null,
						board: {answers, closedAt: null, confirmedAt},
					},
				],
			},
		},
		version: 1,
		online: participants.map((p) => p.id),
		questionCount: 1,
		undoable: null,
	};
};

describe('MonitorView (buzzer-board)', () => {
	it('ボードクイズの回答受付中は、まだ送信していない参加者を未回答として数える', () => {
		const html = renderToStaticMarkup(
			<MonitorView
				{...baseProps}
				view={createView('board-answering', {
					p1: {participantId: 'p1', text: '', submittedAt: 2000, correct: null},
				})}
			/>,
		);
		expect(html).toContain('回答済み: 1 / 3 人');
		expect(html.match(/回答済</g)).toHaveLength(1);
		expect(html.match(/未回答/g)).toHaveLength(2);
	});

	it('ボードクイズ中は、読み上げた問題文を「前の問題」の代わりに表示する', () => {
		const html = renderToStaticMarkup(
			<MonitorView {...baseProps} view={createView('board-answering', {})} />,
		);
		expect(html).toContain('読み上げ済みの問題文です');
		expect(html).not.toContain('前の問題');
		expect(html).not.toContain('A.');
	});

	it('ボードクイズの結果は、参加者が多いと列を増やして表示する', () => {
		const answers = Object.fromEntries(
			Array.from({length: 30}, (_, i) => [
				`p${i + 1}`,
				{participantId: `p${i + 1}`, text: `回答${i + 1}`, submittedAt: 2000, correct: i % 2 === 0},
			]),
		);
		const html = renderToStaticMarkup(
			<MonitorView {...baseProps} view={createView('closed', answers, 30, 4000)} />,
		);
		expect(html).toContain('ボードクイズ結果');
		expect(html).toContain('grid-template-columns:repeat(3, minmax(0, 1fr))');
		expect(html).toContain('回答30');
	});
});
