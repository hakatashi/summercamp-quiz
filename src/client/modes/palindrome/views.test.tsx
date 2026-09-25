import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {describe, expect, it} from 'vitest';
import {HostView} from './HostView.tsx';
import {MonitorView} from './MonitorView.tsx';
import {ParticipantView} from './ParticipantView.tsx';
import {QuestionExtraFields} from './QuestionExtraFields.tsx';
import {ReviewMonitor} from './ReviewMonitor.tsx';
import {createFixtureView, fixtureProps, fixtureQuestions} from './testFixtures.ts';

const participant = (participantId: string, options = {}) =>
	renderToStaticMarkup(
		<ParticipantView
			{...fixtureProps}
			view={createFixtureView({role: 'participant', participantId}, options)}
			participantId={participantId}
		/>,
	);

const host = (options = {}) =>
	renderToStaticMarkup(
		<MemoryRouter>
			<HostView
				{...fixtureProps}
				view={createFixtureView({role: 'host'}, options)}
				participantId={null}
			/>
		</MemoryRouter>,
	);

const monitor = (options = {}) =>
	renderToStaticMarkup(
		<MonitorView
			{...fixtureProps}
			view={createFixtureView({role: 'monitor'}, options)}
			participantId={null}
		/>,
	);

describe('palindrome の画面', () => {
	describe('ParticipantView', () => {
		it('開始前は開始待ちのメッセージだけを表示する', () => {
			const html = participant('p1', {phase: 'waiting'});
			expect(html).toContain('まもなく開始します');
			expect(html).toContain('制限時間 30 分');
			expect(html).not.toContain('順位表');
		});

		it('開催中は全問題のタブ、残り時間、最初の問題の回答欄を表示する', () => {
			const html = participant('p1');
			for (const label of ['A', 'B', 'C', 'D', 'E']) {
				expect(html).toContain(`>${label}</span>`);
			}
			expect(html).toContain('順位表');
			expect(html).toMatch(/残り 19:5\d|残り 20:00/);
			expect(html).toContain('問題 A');
			expect(html).toContain('/api/media/media-q1');
			expect(html).toContain('ひらがなで入力');
			// 開けたヒントの本文と自分の誤答が見える
			expect(html).toContain('寝具から動物が出てきています');
			expect(html).toContain('開放済み');
			expect(html).toContain('まくらのらくま');
			// 正答数と順位
			expect(html).toContain('<strong>1</strong> / 5 問正解');
			// 答えは見えない
			expect(html).not.toContain('まくらからくま');
		});

		it('他人のヒントの本文は見えない', () => {
			const html = participant('p3');
			expect(html).not.toContain('寝具から動物が出てきています');
		});

		it('時間切れの後は入力欄を閉じ、終了を表示する', () => {
			const html = participant('p1', {now: Date.now() - 25 * 60_000});
			expect(html).toContain('コンテストは終了しました');
			expect(html).toContain('結果発表をお待ちください');
			expect(html).not.toContain('ひらがなで入力');
		});

		it('終了後は答えと表記を表示する', () => {
			const html = participant('p1', {phase: 'finished'});
			expect(html).toContain('まくらからくま');
			expect(html).toContain('(枕から熊)');
			expect(html).not.toContain('ひらがなで入力');
		});
	});

	describe('HostView', () => {
		it('開始前は制限時間の設定と開始ボタンを表示する', () => {
			const html = host({phase: 'waiting'});
			expect(html).toContain('制限時間');
			expect(html).toContain('コンテスト開始');
			expect(html).not.toContain('スコアボード');
			expect(html).toContain('まくらからくま');
		});

		it('開催中は延長・打ち切りとスコアボード、誤答の本文を表示する', () => {
			const html = host();
			expect(html).toContain('+5 分');
			expect(html).toContain('コンテストを打ち切る');
			expect(html).toContain('スコアボード');
			expect(html).toContain('まくらのらくま');
			expect(html).toContain('正解 1 / 3 人');
			expect(html).toContain('AI');
		});

		it('時間切れの後は結果の確定、終了後は感想戦の開始を表示する', () => {
			expect(host({now: Date.now() - 25 * 60_000})).toContain('結果を確定する');
			expect(host({phase: 'finished'})).toContain('感想戦を始める');
		});

		it('感想戦中は ReviewControls を表示する', () => {
			const html = host({phase: 'finished', review: {index: 0}});
			expect(html).toContain('感想戦中');
			expect(html).toContain('感想戦を終える');
		});
	});

	describe('MonitorView', () => {
		it('開始前は問題数と制限時間を表示する', () => {
			const html = monitor({phase: 'waiting'});
			expect(html).toContain('全 5 問');
			expect(html).toContain('制限時間 30 分');
		});

		it('開催中は残り時間とスコアボードを表示する', () => {
			const html = monitor();
			expect(html).toContain('残り');
			expect(html).toContain('太郎');
			expect(html).toContain('Claude');
			expect(html).toContain('AI');
			// 最初の正解者の印
			expect(html).toContain('data-result="first"');
			// 答えは出さない
			expect(html).not.toContain('まくらからくま');
		});

		it('参加者が多いときはページを分ける', () => {
			const html = monitor({participantCount: 13});
			expect(html).toContain('1 / 2 ページ');
		});

		it('終了後は「終了」を表示する', () => {
			expect(monitor({phase: 'finished'})).toContain('終了');
		});
	});

	describe('ReviewMonitor', () => {
		it('問題、答え、ヒント、正解者、最初の正解者を表示する', () => {
			const view = createFixtureView({role: 'monitor'}, {phase: 'finished', review: {index: 1}});
			const html = renderToStaticMarkup(
				<ReviewMonitor
					{...fixtureProps}
					view={view}
					participantId={null}
					item={{questionId: 'q2', recordIndex: 1}}
					index={1}
					total={5}
				/>,
			);
			expect(html).toContain('問題 B');
			expect(html).toContain('2 / 5');
			expect(html).toContain('/api/media/media-q2');
			expect(html).toContain('とまと');
			expect(html).toContain('トマト');
			expect(html).toContain('赤い野菜です');
			expect(html).toContain('アアア');
			expect(html).toContain('<strong>2</strong> / 3 人');
			expect(html).toContain('最初の正解者');
			// 花子 (4 分) が太郎 (5 分) より先
			expect(html.indexOf('花子')).toBeLessThan(html.indexOf('太郎'));
		});
	});

	describe('QuestionExtraFields', () => {
		it('答えの回文判定と文字種プレビュー、ヒント欄が表示される', () => {
			const html = renderToStaticMarkup(
				<QuestionExtraFields
					value={fixtureQuestions[0]?.extra ?? {}}
					onChange={() => {}}
					answer="まくらからくま"
				/>,
			);
			expect(html).toContain('回文判定OK (7 文字)');
			expect(html).toContain('状況説明ヒント');
			expect(html).toContain('いらすとやヒント');
			expect(html).toContain('別解');
		});
	});
});
