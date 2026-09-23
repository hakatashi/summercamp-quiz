import {execSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {
	type BuzzerBoardState,
	GENRES,
	type Genre,
} from '../../../shared/modes/buzzer-board/index.ts';
import type {GameView, Participant, Question} from '../../../shared/types.ts';
import {MonitorView} from './MonitorView.tsx';
import {ReviewMonitor} from './ReviewMonitor.tsx';

const outDir = resolve(
	'/home/hakatashi/.gemini/antigravity-cli/brain/783e2f64-99fc-4ba2-988b-287bf4f6dd58/scratch/screenshots',
);
mkdirSync(outDir, {recursive: true});

const rawMonitorCss = readFileSync(resolve(import.meta.dirname, 'MonitorView.module.css'), 'utf8');
const rawReviewCss = readFileSync(resolve(import.meta.dirname, 'ReviewMonitor.module.css'), 'utf8');

const baseProps = {
	connected: true,
	error: null,
	participantId: null,
	send: async () => {},
	undo: async () => '',
};

// 生 CSS を読み込んで、HTML 内で生成されたハッシュ付きクラス名に置換
const makeInlinedCss = (rawCss: string, contentHtml: string) => {
	const match = contentHtml.match(/_([a-zA-Z0-9_-]+)_([a-z0-9]{6})/);
	const suffix = match ? match[2] : '';
	if (!suffix) return rawCss;
	return rawCss.replace(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g, (_, name) => `._${name}_${suffix}`);
};

const renderHtml = (contentHtml: string, inlinedCss: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .viewport {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #000;
    }
    .stage-wrapper {
      width: 1920px;
      height: 1080px;
      flex: none;
      position: relative;
      overflow: hidden;
      transform-origin: center center;
    }
    ${inlinedCss}
  </style>
</head>
<body>
  <div class="viewport">
    <div id="stage" class="stage-wrapper">
      ${contentHtml}
    </div>
  </div>
  <script>
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.getElementById('stage').style.transform = 'scale(' + scale + ')';
  </script>
</body>
</html>`;

const captureHtml = (filename: string, htmlContent: string, width: number, height: number) => {
	const htmlPath = resolve(outDir, `${filename}.html`);
	const pngPath = resolve(outDir, `${filename}.png`);
	writeFileSync(htmlPath, htmlContent, 'utf8');

	execSync(
		`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --window-size=${width},${height} --screenshot="${pngPath}" "file://${htmlPath}"`,
		{stdio: 'pipe'},
	);
};

const createQuestions = (): Question[] =>
	GENRES.map((genre, i) => ({
		id: `q${i + 1}`,
		text: `${genre}に関する問題第${i + 1}問です。日本の首都は東京ですが、フランスの首都はどこでしょう？`,
		answer: `${genre}の答え (パリ)`,
		note: '',
		extra: {genre},
	}));

const createParticipants = (count: number): Participant[] =>
	Array.from({length: count}, (_, i) => ({
		id: `p${i + 1}`,
		name: count <= 5 ? `参加者${i + 1}` : `参加者${String(i + 1).padStart(2, '0')}`,
		joinedAt: 100 + i * 10,
	}));

describe('Monitor & Review Screenshot Capture', () => {
	it('本戦モニター画面: 参加者5人 (1920x1080 & 1280x720)', () => {
		const participants = createParticipants(5);
		const questions = createQuestions();
		const unaskedCounts = Object.fromEntries(GENRES.map((g, i) => [g, i === 0 ? 0 : 3])) as Record<
			Genre,
			number
		>;

		const state: BuzzerBoardState = {
			phase: 'answering',
			scores: {p1: 3, p2: 2, p3: 1, p4: 4, p5: 0},
			rest: {p3: 2},
			cleared: {p4: true},
			streak: {participantId: 'p1', count: 2},
			nextGenre: {genre: 'スポーツ', chosenBy: null},
			genreChooser: 'p1',
			unaskedCounts,
			history: [
				{
					questionId: 'q1',
					startedAt: 1000,
					endedAt: null,
					genre: 'ノンジャンル',
					scoresBefore: {p1: 3, p2: 2, p3: 1, p4: 4, p5: 0},
					restBefore: {p3: 2},
					clearedBefore: {p4: true},
					streakBefore: {participantId: 'p1', count: 2},
					nextGenreBefore: {genre: 'ノンジャンル', chosenBy: null},
					genreChooserBefore: null,
					buzzes: [
						{participantId: 'p1', pressedAt: 1500, receivedAt: 1505, status: 'answering'},
						{participantId: 'p2', pressedAt: 1800, receivedAt: 1805, status: 'waiting'},
					],
					result: null,
					breakdown: null,
					board: null,
				},
			],
		};

		const view: GameView<BuzzerBoardState> = {
			game: {
				id: 'g1',
				mode: 'buzzer-board',
				title: 'サマーキャンプ 早押し＆ボードクイズ (5人)',
				createdAt: 0,
				participants,
				questions,
				state,
				review: null,
			},
			version: 1,
			online: participants.map((p) => p.id),
			questionCount: questions.length,
			undoable: null,
		};

		const contentHtml = renderToStaticMarkup(<MonitorView {...baseProps} view={view} />);
		const monitorCss = makeInlinedCss(rawMonitorCss, contentHtml);

		// 1920x1080
		const html1080 = renderHtml(contentHtml, monitorCss);
		captureHtml('monitor_5p_1920x1080', html1080, 1920, 1080);

		// 1280x720
		const html720 = renderHtml(contentHtml, monitorCss);
		captureHtml('monitor_5p_1280x720', html720, 1280, 720);

		// 要件チェック
		expect(contentHtml).toContain('サマーキャンプ 早押し＆ボードクイズ (5人)');
		expect(contentHtml).toContain('第 1 問');
		expect(contentHtml).toContain('ノンジャンル');
		expect(contentHtml).toContain('参加者1');
		expect(contentHtml).toContain('2連答');
		expect(contentHtml).toContain('休2');
		expect(contentHtml).toContain('勝抜');
	});

	it('本戦モニター画面: 参加者40人 (1920x1080 & 1280x720)', () => {
		const participants = createParticipants(40);
		const questions = createQuestions();
		const unaskedCounts = Object.fromEntries(
			GENRES.map((g, i) => [g, i % 3 === 0 ? 0 : 2]),
		) as Record<Genre, number>;

		const scores: Record<string, number> = {};
		const cleared: Record<string, boolean> = {};
		const rest: Record<string, number> = {};
		for (let i = 0; i < 40; i++) {
			const id = `p${i + 1}`;
			const score = Math.max(0, 5 - Math.floor(i / 8));
			scores[id] = score;
			if (score >= 5) cleared[id] = true;
			if (i === 10 || i === 11) rest[id] = 3;
		}

		const state: BuzzerBoardState = {
			phase: 'answering',
			scores,
			rest,
			cleared,
			streak: {participantId: 'p1', count: 1},
			nextGenre: {genre: '科学', chosenBy: null},
			genreChooser: null,
			unaskedCounts,
			history: [
				{
					questionId: 'q2',
					startedAt: 1000,
					endedAt: null,
					genre: '世界史',
					scoresBefore: scores,
					restBefore: rest,
					clearedBefore: cleared,
					streakBefore: {participantId: 'p1', count: 1},
					nextGenreBefore: {genre: '世界史', chosenBy: null},
					genreChooserBefore: null,
					buzzes: [
						{participantId: 'p15', pressedAt: 1200, receivedAt: 1205, status: 'answering'},
						{participantId: 'p16', pressedAt: 1400, receivedAt: 1405, status: 'waiting'},
						{participantId: 'p17', pressedAt: 1600, receivedAt: 1605, status: 'waiting'},
					],
					result: null,
					breakdown: null,
					board: null,
				},
			],
		};

		const view: GameView<BuzzerBoardState> = {
			game: {
				id: 'g2',
				mode: 'buzzer-board',
				title: 'サマーキャンプ 早押し＆ボードクイズ (40人)',
				createdAt: 0,
				participants,
				questions,
				state,
				review: null,
			},
			version: 1,
			online: participants.map((p) => p.id),
			questionCount: questions.length,
			undoable: null,
		};

		const contentHtml = renderToStaticMarkup(<MonitorView {...baseProps} view={view} />);
		const monitorCss = makeInlinedCss(rawMonitorCss, contentHtml);

		// 1920x1080
		const html1080 = renderHtml(contentHtml, monitorCss);
		captureHtml('monitor_40p_1920x1080', html1080, 1920, 1080);

		// 1280x720
		const html720 = renderHtml(contentHtml, monitorCss);
		captureHtml('monitor_40p_1280x720', html720, 1280, 720);

		// 40人全員が得点表に出ていることを確認
		for (let i = 1; i <= 40; i++) {
			expect(contentHtml).toContain(`参加者${String(i).padStart(2, '0')}`);
		}
	});

	it('ボードクイズ: 確定前 (回答受付中) は回答本文と判定が出ないことを確認', () => {
		const participants = createParticipants(5);
		const questions = createQuestions();
		const unaskedCounts = Object.fromEntries(GENRES.map((g) => [g, 2])) as Record<Genre, number>;

		const state: BuzzerBoardState = {
			phase: 'board-answering',
			scores: {p1: 5, p2: 5, p3: 2, p4: 1, p5: 0},
			rest: {},
			cleared: {p1: true, p2: true},
			streak: null,
			nextGenre: {genre: '文学', chosenBy: null},
			genreChooser: null,
			unaskedCounts,
			history: [
				{
					questionId: 'q3',
					startedAt: 1000,
					endedAt: null,
					genre: '文学',
					scoresBefore: {p1: 5, p2: 5, p3: 2, p4: 1, p5: 0},
					restBefore: {},
					clearedBefore: {p1: true, p2: true},
					streakBefore: null,
					nextGenreBefore: {genre: '文学', chosenBy: null},
					genreChooserBefore: null,
					buzzes: [],
					result: null,
					breakdown: null,
					board: {
						answers: {
							p1: {participantId: 'p1', text: '', submittedAt: 2000, correct: null}, // モニターにはtext: '' で届く
							p2: {participantId: 'p2', text: '', submittedAt: null, correct: null},
						},
						closedAt: null,
						confirmedAt: null,
					},
				},
			],
		};

		const view: GameView<BuzzerBoardState> = {
			game: {
				id: 'g3',
				mode: 'buzzer-board',
				title: 'ボードクイズ確認',
				createdAt: 0,
				participants,
				questions,
				state,
				review: null,
			},
			version: 1,
			online: participants.map((p) => p.id),
			questionCount: questions.length,
			undoable: null,
		};

		const contentHtml = renderToStaticMarkup(<MonitorView {...baseProps} view={view} />);
		const monitorCss = makeInlinedCss(rawMonitorCss, contentHtml);
		const html1080 = renderHtml(contentHtml, monitorCss);
		captureHtml('monitor_board_answering_1920x1080', html1080, 1920, 1080);

		// 完了条件: ボードの回答と判定が、確定前にモニターに出ない
		expect(contentHtml).toContain('回答受付中');
		expect(contentHtml).toContain('回答済');
		expect(contentHtml).toContain('未回答');
		expect(contentHtml).not.toContain('正解');
		expect(contentHtml).not.toContain('不正解');
	});

	it('ボードクイズ: 確定後は回答本文と判定が出ることを確認', () => {
		const participants = createParticipants(5);
		const questions = createQuestions();
		const unaskedCounts = Object.fromEntries(GENRES.map((g) => [g, 2])) as Record<Genre, number>;

		const state: BuzzerBoardState = {
			phase: 'closed',
			scores: {p1: 6, p2: 5, p3: 2, p4: 1, p5: 0},
			rest: {},
			cleared: {p1: true, p2: true},
			streak: null,
			nextGenre: {genre: '芸能', chosenBy: null},
			genreChooser: null,
			unaskedCounts,
			history: [
				{
					questionId: 'q3',
					startedAt: 1000,
					endedAt: 5000,
					genre: '文学',
					scoresBefore: {p1: 5, p2: 5, p3: 2, p4: 1, p5: 0},
					restBefore: {},
					clearedBefore: {p1: true, p2: true},
					streakBefore: null,
					nextGenreBefore: {genre: '文学', chosenBy: null},
					genreChooserBefore: null,
					buzzes: [],
					result: 'correct',
					breakdown: null,
					board: {
						answers: {
							p1: {participantId: 'p1', text: '我が輩は猫である', submittedAt: 2000, correct: true},
							p2: {participantId: 'p2', text: '坊ちゃん', submittedAt: 2500, correct: false},
						},
						closedAt: 3000,
						confirmedAt: 4000,
					},
				},
			],
		};

		const view: GameView<BuzzerBoardState> = {
			game: {
				id: 'g4',
				mode: 'buzzer-board',
				title: 'ボードクイズ確定後',
				createdAt: 0,
				participants,
				questions,
				state,
				review: null,
			},
			version: 1,
			online: participants.map((p) => p.id),
			questionCount: questions.length,
			undoable: null,
		};

		const contentHtml = renderToStaticMarkup(<MonitorView {...baseProps} view={view} />);
		const monitorCss = makeInlinedCss(rawMonitorCss, contentHtml);
		const html1080 = renderHtml(contentHtml, monitorCss);
		captureHtml('monitor_board_confirmed_1920x1080', html1080, 1920, 1080);

		expect(contentHtml).toContain('ボードクイズ結果');
		expect(contentHtml).toContain('我が輩は猫である');
		expect(contentHtml).toContain('坊ちゃん');
		expect(contentHtml).toContain('○');
		expect(contentHtml).toContain('×');
	});

	it('感想戦画面: 早押し (1920x1080 & 1280x720) と ボードクイズ', () => {
		const participants = createParticipants(5);
		const questions = createQuestions();

		const state: BuzzerBoardState = {
			phase: 'finished',
			scores: {p1: 6, p2: 5, p3: 2, p4: 1, p5: 0},
			rest: {},
			cleared: {p1: true, p2: true},
			streak: null,
			nextGenre: {genre: '地理', chosenBy: null},
			genreChooser: null,
			unaskedCounts: Object.fromEntries(GENRES.map((g) => [g, 0])) as Record<Genre, number>,
			history: [
				{
					questionId: 'q1',
					startedAt: 1000,
					endedAt: 3000,
					genre: 'ノンジャンル',
					scoresBefore: {p1: 2, p2: 1, p3: 0, p4: 4, p5: 0},
					restBefore: {p3: 1},
					clearedBefore: {},
					streakBefore: {participantId: 'p1', count: 1},
					nextGenreBefore: {genre: 'ノンジャンル', chosenBy: null},
					genreChooserBefore: null,
					buzzes: [{participantId: 'p1', pressedAt: 2200, receivedAt: 2205, status: 'correct'}],
					result: 'correct',
					breakdown: {base: 1, bonus: 1},
					board: null,
				},
				{
					questionId: 'q2',
					startedAt: 4000,
					endedAt: 8000,
					genre: 'スポーツ',
					scoresBefore: {p1: 4, p2: 1, p3: 0, p4: 4, p5: 0},
					restBefore: {},
					clearedBefore: {},
					streakBefore: {participantId: 'p1', count: 2},
					nextGenreBefore: {genre: 'スポーツ', chosenBy: null},
					genreChooserBefore: null,
					buzzes: [],
					result: 'correct',
					breakdown: null,
					board: {
						answers: {
							p1: {participantId: 'p1', text: 'サッカー', submittedAt: 5000, correct: true},
							p2: {participantId: 'p2', text: '野球', submittedAt: 5500, correct: false},
						},
						closedAt: 6000,
						confirmedAt: 7000,
					},
				},
			],
		};

		const view: GameView<BuzzerBoardState> = {
			game: {
				id: 'g5',
				mode: 'buzzer-board',
				title: '感想戦テスト',
				createdAt: 0,
				participants,
				questions,
				state,
				review: {index: 0},
			},
			version: 1,
			online: participants.map((p) => p.id),
			questionCount: 2,
			undoable: null,
		};

		// 第1問 (早押し)
		const htmlQ1 = renderToStaticMarkup(
			<ReviewMonitor
				view={view}
				connected={true}
				error={null}
				participantId={null}
				item={{questionId: 'q1', recordIndex: 0}}
				index={0}
				total={2}
				send={async () => {}}
				undo={async () => ''}
			/>,
		);
		const reviewCssQ1 = makeInlinedCss(rawReviewCss, htmlQ1);
		captureHtml('review_q1_1920x1080', renderHtml(htmlQ1, reviewCssQ1), 1920, 1080);
		captureHtml('review_q1_1280x720', renderHtml(htmlQ1, reviewCssQ1), 1280, 720);

		expect(htmlQ1).toContain('第 1 問');
		expect(htmlQ1).toContain('ノンジャンル');
		expect(htmlQ1).toContain('正解 +1 / 連答ボーナス +1');
		expect(htmlQ1).toContain('+2');

		// 第2問 (ボードクイズ)
		const htmlQ2 = renderToStaticMarkup(
			<ReviewMonitor
				view={view}
				connected={true}
				error={null}
				participantId={null}
				item={{questionId: 'q2', recordIndex: 1}}
				index={1}
				total={2}
				send={async () => {}}
				undo={async () => ''}
			/>,
		);
		const reviewCssQ2 = makeInlinedCss(rawReviewCss, htmlQ2);
		captureHtml('review_q2_board_1920x1080', renderHtml(htmlQ2, reviewCssQ2), 1920, 1080);
		captureHtml('review_q2_board_1280x720', renderHtml(htmlQ2, reviewCssQ2), 1280, 720);

		expect(htmlQ2).toContain('第 2 問');
		expect(htmlQ2).toContain('スポーツ');
		expect(htmlQ2).toContain('サッカー');
		expect(htmlQ2).toContain('野球');
	});
});
