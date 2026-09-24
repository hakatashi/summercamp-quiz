import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {describe, expect, it} from 'vitest';
import type {PalindromeState} from '../../../shared/modes/palindrome/index.ts';
import type {GameView, Question} from '../../../shared/types.ts';
import {HostView} from './HostView.tsx';
import {MonitorView} from './MonitorView.tsx';
import {ParticipantView} from './ParticipantView.tsx';
import {QuestionExtraFields} from './QuestionExtraFields.tsx';

describe('Palindrome Views', () => {
	const mockQuestion: Question = {
		id: 'q1',
		text: '',
		answer: 'まくらからくま',
		note: '',
		extra: {
			image: 'media-img-1',
			notation: '枕から熊',
			altAnswers: ['まくらからのくま'],
			charCount: 7,
			hints: {
				situation: '寝具から動物が出てきています',
				irasutoya: '枕と熊のイラスト',
				charTypes: '漢ああ漢',
			},
		},
	};

	const createGameView = (stateOverride?: Partial<PalindromeState>): GameView<PalindromeState> => ({
		version: 1,
		online: ['p1', 'p2'],
		questionCount: 5,
		undoable: null,
		game: {
			id: 'g1',
			mode: 'palindrome',
			title: '回文クイズ大会',
			createdAt: 0,
			review: null,
			participants: [
				{id: 'p1', name: '太郎', joinedAt: 100, kind: 'human'},
				{id: 'p2', name: 'Claude', joinedAt: 200, kind: 'ai'},
			],
			questions: [mockQuestion],
			state: {
				phase: 'open',
				showStandings: false,
				history: [
					{
						questionId: 'q1',
						openedAt: 1000,
						closedAt: null,
						participants: {
							p1: {
								hints: {situation: 2000},
								wrong: [{text: 'まくらのくま', at: 2500}],
								correctAt: null,
							},
							p2: {
								hints: {charTypes: 1500, irasutoya: 2200},
								wrong: [],
								correctAt: 3000,
							},
						},
					},
				],
				...stateOverride,
			},
		},
	});

	const dummyProps = {
		connected: true,
		error: null,
		send: async () => {},
		undo: async () => '',
	};

	describe('ParticipantView', () => {
		it('waiting フェーズでは開始前メッセージが表示される', () => {
			const view = createGameView({phase: 'waiting'});
			const html = renderToStaticMarkup(
				<ParticipantView {...dummyProps} view={view} participantId="p1" />,
			);
			expect(html).toContain('まもなく開始します');
			expect(html).toContain('太郎');
		});

		it('open フェーズで回答中ならイラスト、マス目、ヒント、回答欄が表示される', () => {
			const view = createGameView();
			const html = renderToStaticMarkup(
				<ParticipantView {...dummyProps} view={view} participantId="p1" />,
			);
			expect(html).toContain('第 1 問 イラスト');
			expect(html).toContain('/api/media/media-img-1');
			expect(html).toContain('状況説明');
			expect(html).toContain('開放済み');
			expect(html).toContain('寝具から動物が出てきています');
			expect(html).toContain('ひらがなで入力');
			expect(html).toContain('誤答 (1 回)');
			expect(html).toContain('まくらのくま');
		});

		it('正解済みの場合は記録と順位が表示され、入力欄が閉じる', () => {
			const view = createGameView();
			const html = renderToStaticMarkup(
				<ParticipantView {...dummyProps} view={view} participantId="p2" />,
			);
			expect(html).toContain('正解！');
			expect(html).toContain('現在 1 位');
			expect(html).not.toContain('ひらがなで入力');
		});

		it('closed フェーズでは正解と表記が表示される', () => {
			const view = createGameView({phase: 'closed'});
			const html = renderToStaticMarkup(
				<ParticipantView {...dummyProps} view={view} participantId="p1" />,
			);
			expect(html).toContain('まくらからくま');
			expect(html).toContain('(枕から熊)');
		});
	});

	describe('HostView', () => {
		it('出題中の問題情報、操作ボタン、参加者状況一覧が表示される', () => {
			const view = createGameView();
			const html = renderToStaticMarkup(
				<MemoryRouter>
					<HostView {...dummyProps} view={view} participantId={null} />
				</MemoryRouter>,
			);
			expect(html).toContain('次の問題へ');
			expect(html).toContain('問題を終了');
			expect(html).toContain('総合順位をモニターに表示');
			expect(html).toContain('まくらからくま');
			expect(html).toContain('枕から熊');
			expect(html).toContain('寝具から動物が出てきています');
			expect(html).toContain('太郎');
			expect(html).toContain('Claude');
			expect(html).toContain('AI');
			expect(html).toContain('○ 正解');
			expect(html).toContain('回答中');
			expect(html).toContain('まくらのくま');
		});
	});

	describe('MonitorView', () => {
		it('出題中画面でイラスト、マス目、参加者の回答状況が表示される', () => {
			const view = createGameView();
			const html = renderToStaticMarkup(
				<MonitorView {...dummyProps} view={view} participantId={null} />,
			);
			expect(html).toContain('第 1 問');
			expect(html).toContain('/api/media/media-img-1');
			expect(html).toContain('太郎');
			expect(html).toContain('Claude');
			expect(html).toContain('AI');
		});

		it('showStandings または finished では総合順位が表示される', () => {
			const view = createGameView({showStandings: true});
			const html = renderToStaticMarkup(
				<MonitorView {...dummyProps} view={view} participantId={null} />,
			);
			expect(html).toContain('総合順位');
			expect(html).toContain('総合順位結果');
			expect(html).toContain('問正解');
			expect(html).toContain('Claude');
		});
	});

	describe('QuestionExtraFields', () => {
		it('答えの回文判定と文字種プレビュー、MediaInput、ヒント欄が表示される', () => {
			const html = renderToStaticMarkup(
				<QuestionExtraFields
					value={mockQuestion.extra}
					onChange={() => {}}
					answer="まくらからくま"
				/>,
			);
			expect(html).toContain('回文判定OK (7 文字)');
			expect(html).toContain('回文イラスト');
			expect(html).toContain('表記 (漢字・カタカナ混じりの自然な表記)');
			expect(html).toContain('状況説明ヒント');
			expect(html).toContain('いらすとやヒント');
			expect(html).toContain('別解');
		});

		it('答えが回文でない場合にエラー表示が出る', () => {
			const html = renderToStaticMarkup(
				<QuestionExtraFields value={mockQuestion.extra} onChange={() => {}} answer="りんご" />,
			);
			expect(html).toContain('回文になっていません');
		});
	});
});
