import {execSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import type {ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {describe, expect, it} from 'vitest';
import reviewControlsStyles from '../../components/ReviewControls.module.css';
import hostStyles from './HostView.module.css';
import {HostView} from './HostView.tsx';
import monitorStyles from './MonitorView.module.css';
import {MonitorView} from './MonitorView.tsx';
import participantStyles from './ParticipantView.module.css';
import {ParticipantView} from './ParticipantView.tsx';
import reviewStyles from './ReviewMonitor.module.css';
import {ReviewMonitor} from './ReviewMonitor.tsx';
import scoreboardStyles from './Scoreboard.module.css';
import {createFixtureView, type FixtureOptions, fixtureProps} from './testFixtures.ts';

/**
 * 静的 HTML にした画面をヘッドレス Chrome で撮影する (目視確認用)。
 * 画像は OS の一時ディレクトリの summercamp-quiz-screenshots/palindrome に出力する。
 */

const outDir = resolve(tmpdir(), 'summercamp-quiz-screenshots', 'palindrome');
mkdirSync(outDir, {recursive: true});

const cssFile = (path: string) => readFileSync(resolve(import.meta.dirname, path), 'utf8');

/** CSS Modules のクラス名 (_name_hash) に合わせて、生の CSS のセレクタを書き換える */
const inlineModule = (rawCss: string, styles: Record<string, string>) =>
	rawCss.replace(/\.([a-zA-Z][a-zA-Z0-9_-]*)(?=[\s{:,.[)>+~])/g, (match, name: string) =>
		typeof styles[name] === 'string' ? `.${styles[name]}` : match,
	);

const css = [
	cssFile('../../global.css'),
	inlineModule(cssFile('Scoreboard.module.css'), scoreboardStyles),
	inlineModule(cssFile('MonitorView.module.css'), monitorStyles),
	inlineModule(cssFile('ReviewMonitor.module.css'), reviewStyles),
	inlineModule(cssFile('ParticipantView.module.css'), participantStyles),
	inlineModule(cssFile('HostView.module.css'), hostStyles),
	inlineModule(cssFile('../../components/ReviewControls.module.css'), reviewControlsStyles),
].join('\n');

const stageHtml = (content: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
${css}
html, body { margin: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
#stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; }
</style></head>
<body><div id="stage">${content}</div>
<script>
const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
document.getElementById('stage').style.transform = 'scale(' + scale + ')';
</script></body></html>`;

const pageHtml = (content: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style></head><body>${content}</body></html>`;

/** スマホの幅 (390px) の枠に入れる。ヘッドレス Chrome はこれより狭いウィンドウを作れないため */
const mobileHtml = (content: string) =>
	pageHtml(`<div style="width: 390px; overflow: hidden; position: relative;">${content}</div>`);

const capture = (name: string, html: string, width: number, height: number) => {
	const htmlPath = resolve(outDir, `${name}.html`);
	const pngPath = resolve(outDir, `${name}.png`);
	writeFileSync(htmlPath, html, 'utf8');
	execSync(
		`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --hide-scrollbars --window-size=${width},${height} --screenshot="${pngPath}" "file://${htmlPath}"`,
		{stdio: 'pipe'},
	);
	return html;
};

const render = (element: ReactElement) => renderToStaticMarkup(element);

const monitor = (options: FixtureOptions) =>
	render(
		<MonitorView
			{...fixtureProps}
			view={createFixtureView({role: 'monitor'}, options)}
			participantId={null}
		/>,
	);

const participant = (options: FixtureOptions) =>
	render(
		<ParticipantView
			{...fixtureProps}
			view={createFixtureView({role: 'participant', participantId: 'p1'}, options)}
			participantId="p1"
		/>,
	);

const host = (options: FixtureOptions) =>
	render(
		<MemoryRouter>
			<HostView
				{...fixtureProps}
				view={createFixtureView({role: 'host'}, options)}
				participantId={null}
			/>
		</MemoryRouter>,
	);

describe.skipIf(process.env.SCREENSHOT !== '1')(
	'palindrome のスクリーンショット (SCREENSHOT=1)',
	() => {
		it('モニター: 開始前', () => {
			expect(
				capture('monitor-waiting', stageHtml(monitor({phase: 'waiting'})), 1920, 1080),
			).toBeTruthy();
		});

		it('モニター: 開催中 (6 人)', () => {
			capture('monitor-running', stageHtml(monitor({participantCount: 6})), 1920, 1080);
		});

		it('モニター: 開催中 (12 人・縮小表示)', () => {
			capture('monitor-running-12', stageHtml(monitor({participantCount: 12})), 1280, 720);
		});

		it('モニター: 感想戦', () => {
			const view = createFixtureView(
				{role: 'monitor'},
				{phase: 'finished', participantCount: 8, review: {index: 1}},
			);
			const html = render(
				<ReviewMonitor
					{...fixtureProps}
					view={view}
					participantId={null}
					item={{questionId: 'q2', recordIndex: 1}}
					index={1}
					total={5}
				/>,
			);
			capture('monitor-review', stageHtml(html), 1920, 1080);
		});

		it('参加者: 開催中 (スマホ)', () => {
			capture('participant-running', mobileHtml(participant({})), 390, 1400);
		});

		it('参加者: 終了後 (スマホ)', () => {
			capture('participant-finished', mobileHtml(participant({phase: 'finished'})), 390, 1200);
		});

		it('司会者: 開始前', () => {
			capture('host-waiting', pageHtml(host({phase: 'waiting'})), 1280, 1000);
		});

		it('司会者: 開催中', () => {
			capture('host-running', pageHtml(host({participantCount: 6})), 1280, 1400);
		});
	},
);
