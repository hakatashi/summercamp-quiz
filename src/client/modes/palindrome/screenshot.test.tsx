import {execSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {describe, expect, it} from 'vitest';
import type {PalindromeState} from '../../../shared/modes/palindrome/index.ts';
import type {GameView, Question} from '../../../shared/types.ts';
import {HostView} from './HostView.tsx';
import {MonitorView} from './MonitorView.tsx';
import {ParticipantView} from './ParticipantView.tsx';
import {QuestionExtraFields} from './QuestionExtraFields.tsx';

const outDir = resolve(
	'/home/hakatashi/.gemini/antigravity-cli/brain/980ebf65-1862-473d-a474-247c3c00bb92/scratch/screenshots',
);
mkdirSync(outDir, {recursive: true});

const rawMonitorCss = readFileSync(resolve(import.meta.dirname, 'MonitorView.module.css'), 'utf8');
const rawParticipantCss = readFileSync(
	resolve(import.meta.dirname, 'ParticipantView.module.css'),
	'utf8',
);
const rawHostCss = readFileSync(resolve(import.meta.dirname, 'HostView.module.css'), 'utf8');
const rawFieldsCss = readFileSync(
	resolve(import.meta.dirname, 'QuestionExtraFields.module.css'),
	'utf8',
);

const baseProps = {
	connected: true,
	error: null,
	send: async () => {},
	undo: async () => '',
};

const makeInlinedCss = (rawCss: string, contentHtml: string) => {
	const match = contentHtml.match(/_([a-zA-Z0-9_-]+)_([a-z0-9]{6})/);
	const suffix = match ? match[2] : '';
	if (!suffix) return rawCss;
	return rawCss.replace(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g, (_, name) => `._${name}_${suffix}`);
};

const renderMonitorHtml = (contentHtml: string, inlinedCss: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .viewport {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      overflow: hidden; background: #000;
    }
    .stage-wrapper {
      width: 1920px; height: 1080px; flex: none; position: relative; overflow: hidden;
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

const renderMobileHtml = (contentHtml: string, inlinedCss: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 390px; min-height: 844px; background: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      overflow-x: hidden;
    }
    .mobile-frame {
      width: 390px;
      max-width: 390px;
      min-height: 844px;
      margin: 0;
      position: relative;
    }
    ${inlinedCss}
  </style>
</head>
<body>
  <div class="mobile-frame">
    ${contentHtml}
  </div>
</body>
</html>`;

const renderStandardHtml = (
	contentHtml: string,
	inlinedCss: string,
	width?: number,
) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; min-height: 100%; background: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      ${width ? `width: ${width}px;` : ''}
    }
    ${inlinedCss}
  </style>
</head>
<body>
  ${contentHtml}
</body>
</html>`;

const captureHtml = (filename: string, htmlContent: string, width: number, height: number) => {
	const htmlPath = resolve(outDir, `${filename}.html`);
	const pngPath = resolve(outDir, `${filename}.png`);
	writeFileSync(htmlPath, htmlContent, 'utf8');

	execSync(
		`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --hide-scrollbars --window-size=${width},${height} --screenshot="${pngPath}" "file://${htmlPath}"`,
		{stdio: 'pipe'},
	);
};

const mockQuestion: Question = {
	id: 'q1',
	text: '',
	answer: 'まくらからくま',
	note: '',
	extra: {
		image: 'mock-image-id',
		notation: '枕から熊',
		altAnswers: ['まくらからのくま'],
		charCount: 7,
		hints: {
			situation: '寝具から動物が出てきています',
			irasutoya: '「枕のイラスト」、「熊のキャラクター」が使われています。',
			charTypes: '漢ああ漢',
		},
	},
};

const createMockGameView = (
	participantCount = 6,
	stateOverride?: Partial<PalindromeState>,
): GameView<PalindromeState> => {
	const participants = Array.from({length: participantCount}).map((_, i) => ({
		id: `p${i + 1}`,
		name: i === 1 ? 'Claude' : `参加者${i + 1}`,
		joinedAt: 100 * (i + 1),
		kind: i === 1 ? ('ai' as const) : ('human' as const),
	}));

	const now = Date.now();
	const openedAt = now - 15000;
	const pRecs: PalindromeState['history'][0]['participants'] = {};
	for (let i = 0; i < participantCount; i++) {
		const pid = `p${i + 1}`;
		if (i === 0) {
			pRecs[pid] = {
				hints: {situation: openedAt + 2000},
				wrong: [{text: 'まくらのくま', at: openedAt + 2500}],
				correctAt: openedAt + 4400,
			};
		} else if (i === 1) {
			pRecs[pid] = {
				hints: {charTypes: openedAt + 1500, irasutoya: openedAt + 3000},
				wrong: [],
				correctAt: openedAt + 5200,
			};
		} else if (i === 2) {
			pRecs[pid] = {
				hints: {charTypes: openedAt + 2000},
				wrong: [{text: 'まくらからとり', at: openedAt + 3500}],
				correctAt: null,
			};
		} else {
			pRecs[pid] = {hints: {}, wrong: [], correctAt: null};
		}
	}

	return {
		version: 1,
		online: participants.map((p) => p.id),
		questionCount: 10,
		undoable: null,
		game: {
			id: 'g1',
			mode: 'palindrome',
			title: '夏合宿イラスト回文クイズ王決定戦',
			createdAt: 0,
			review: null,
			participants,
			questions: [mockQuestion],
			state: {
				phase: 'open',
				showStandings: false,
				history: [
					{
						questionId: 'q1',
						openedAt,
						closedAt: null,
						participants: pRecs,
					},
				],
				...stateOverride,
			},
		},
	};
};

describe('Palindrome Screenshots', () => {
	it('モニター画面: 出題中 (1920x1080 & 1280x720)', () => {
		const view = createMockGameView(6);
		const html = renderToStaticMarkup(
			<MonitorView {...baseProps} view={view} participantId={null} />,
		);
		const inlined = makeInlinedCss(rawMonitorCss, html);
		const fullHtml = renderMonitorHtml(html, inlined);

		captureHtml('monitor_open_1920', fullHtml, 1920, 1080);
		captureHtml('monitor_open_1280', fullHtml, 1280, 720);
		expect(html).toContain('回答状況');
	});

	it('モニター画面: 参加者30人の回答状況 (1920x1080)', () => {
		const view = createMockGameView(30);
		const html = renderToStaticMarkup(
			<MonitorView {...baseProps} view={view} participantId={null} />,
		);
		const inlined = makeInlinedCss(rawMonitorCss, html);
		const fullHtml = renderMonitorHtml(html, inlined);

		captureHtml('monitor_open_30p_1920', fullHtml, 1920, 1080);
		expect(html).toContain('参加者30');
	});

	it('モニター画面: 問題終了後・答え公開 (1920x1080)', () => {
		const view = createMockGameView(6, {phase: 'closed'});
		const html = renderToStaticMarkup(
			<MonitorView {...baseProps} view={view} participantId={null} />,
		);
		const inlined = makeInlinedCss(rawMonitorCss, html);
		const fullHtml = renderMonitorHtml(html, inlined);

		captureHtml('monitor_closed_1920', fullHtml, 1920, 1080);
		expect(html).toContain('まくらからくま');
	});

	it('モニター画面: 総合順位 (1920x1080)', () => {
		const view = createMockGameView(15, {showStandings: true});
		const html = renderToStaticMarkup(
			<MonitorView {...baseProps} view={view} participantId={null} />,
		);
		const inlined = makeInlinedCss(rawMonitorCss, html);
		const fullHtml = renderMonitorHtml(html, inlined);

		captureHtml('monitor_standings_1920', fullHtml, 1920, 1080);
		expect(html).toContain('総合順位結果');
	});

	it('参加者画面: スマホ縦向き 正解後 (390x844 - iPhone解像度)', () => {
		const view = createMockGameView(6);
		const html = renderToStaticMarkup(
			<ParticipantView {...baseProps} view={view} participantId="p1" />,
		);
		const inlined = makeInlinedCss(rawParticipantCss, html);
		const fullHtml = renderMobileHtml(html, inlined);

		captureHtml('participant_mobile_correct_390', fullHtml, 390, 844);
		expect(html).toContain('参加者1');
		expect(html).toContain('正解！');
	});

	it('参加者画面: スマホ縦向き 回答中 (390x844 - iPhone解像度)', () => {
		const view = createMockGameView(6);
		const html = renderToStaticMarkup(
			<ParticipantView {...baseProps} view={view} participantId="p3" />,
		);
		const inlined = makeInlinedCss(rawParticipantCss, html);
		const fullHtml = renderMobileHtml(html, inlined);

		captureHtml('participant_mobile_answering_390', fullHtml, 390, 844);
		expect(html).toContain('参加者3');
		expect(html).toContain('ひらがなで入力');
	});

	it('司会者画面: PC画面 (1280x900)', () => {
		const view = createMockGameView(6);
		const html = renderToStaticMarkup(
			<MemoryRouter>
				<HostView {...baseProps} view={view} participantId={null} />
			</MemoryRouter>,
		);
		const inlined = makeInlinedCss(rawHostCss, html);
		const fullHtml = renderStandardHtml(html, inlined, 1280);

		captureHtml('host_desktop_1280', fullHtml, 1280, 900);
		expect(html).toContain('司会者');
		expect(html).toContain('次の問題へ');
	});

	it('問題編集画面: QuestionExtraFields (1000x800)', () => {
		const html = renderToStaticMarkup(
			<div
				style={{
					maxWidth: '800px',
					margin: '20px auto',
					background: '#fff',
					padding: '24px',
					borderRadius: '12px',
				}}
			>
				<QuestionExtraFields
					value={mockQuestion.extra}
					onChange={() => {}}
					answer="まくらからくま"
				/>
			</div>,
		);
		const inlined = makeInlinedCss(rawFieldsCss, html);
		const fullHtml = renderStandardHtml(html, inlined, 1000);

		captureHtml('extra_fields_edit', fullHtml, 1000, 800);
		expect(html).toContain('回文判定OK (7 文字)');
	});
});
