#!/usr/bin/env node
// リスニング数学の問題文を Google Cloud Text-to-Speech (Gemini TTS) で読み上げ音声にする。
//
// 使い方:
//   node scripts/generate-listening-math-audio.ts [問題TSV] [--out 出力先] [--pace 名前,...] [--only 問題番号,...] [--force]
//
// - 問題 TSV は「問題番号\t問題文\t答え\t出典」の形式 (1行目は見出し)。既定は data/listening-math/questions.tsv
// - 読み上げ速度の指示を変えたバージョンを <出力先>/<pace>/q01.wav のように保存する
// - 認証には gcloud のアクセストークンを使う。課金先プロジェクトは環境変数 GCP_PROJECT か gcloud の既定プロジェクト
// - 既に存在するファイルは --force を付けない限り作り直さない
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {parseArgs, promisify} from 'node:util';

const execFileAsync = promisify(execFile);

const ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 5;

/** 読み上げ速度の指示。prompt 中の {pace} をこの文に置き換える */
const PACES: Record<string, string> = {
	'much-faster': 'Speak much faster than normal pace.',
	faster: 'Speak faster than normal pace.',
	'slightly-faster': 'Speak slightly faster than normal pace.',
	normal: 'Speak at normal pace.',
};

const PROMPT =
	'Read aloud in a calm, clear, and articulate voice, like a professional quiz show narrator reading a math problem to contestants who must take notes by ear. {pace} Pronounce every number, fraction, variable name, and mathematical term distinctly and never slur them together. Insert a short pause after each sentence and a brief pause before and after every numerical value or condition, so listeners have time to write it down. Keep the tone neutral and even throughout; do not dramatize or rush the ending. Treat each fraction as a single unit and read it slowly, with a slight pause right after it. Read single Latin letters (such as A, B, C, P, Q, x, y, i) clearly and separately, as they would be read in a Japanese math class.';

interface Question {
	index: number;
	label: string;
	text: string;
}

const {values, positionals} = parseArgs({
	allowPositionals: true,
	options: {
		out: {type: 'string', default: 'data/listening-math/audio'},
		pace: {type: 'string'},
		only: {type: 'string'},
		force: {type: 'boolean', default: false},
	},
});

const inputPath = resolve(positionals[0] ?? 'data/listening-math/questions.tsv');
const outDir = resolve(values.out);
const paceNames = values.pace ? values.pace.split(',') : Object.keys(PACES);
for (const name of paceNames) {
	if (!(name in PACES)) {
		throw new Error(`不明な pace です: ${name} (${Object.keys(PACES).join(', ')} から選ぶ)`);
	}
}
const only = values.only ? new Set(values.only.split(',').map(Number)) : null;

const parseQuestions = (tsv: string): Question[] =>
	tsv
		.split(/\r?\n/)
		.slice(1)
		.filter((line) => line.trim() !== '')
		.map((line, i) => {
			const [label = '', text = ''] = line.split('\t');
			return {index: i + 1, label: label.trim(), text: text.trim()};
		});

const gcloud = async (...args: string[]): Promise<string> => {
	const {stdout} = await execFileAsync('gcloud', args);
	return stdout.trim();
};

const accessToken = await gcloud('auth', 'print-access-token');
const project = process.env.GCP_PROJECT || (await gcloud('config', 'get-value', 'project'));
if (!project) {
	throw new Error('課金先の GCP プロジェクトが決まらない。GCP_PROJECT を指定する');
}

const synthesize = async (text: string, pace: string): Promise<Buffer> => {
	const body = {
		audioConfig: {audioEncoding: 'LINEAR16', pitch: 0, speakingRate: 1},
		input: {prompt: PROMPT.replace('{pace}', pace), text},
		voice: {languageCode: 'ja-jp', modelName: 'gemini-3.1-flash-tts-preview', name: 'Sadaltager'},
	};
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'x-goog-user-project': project,
				'Content-Type': 'application/json; charset=utf-8',
			},
			body: JSON.stringify(body),
		});
		if (res.ok) {
			const json = (await res.json()) as {audioContent: string};
			return Buffer.from(json.audioContent, 'base64');
		}
		const message = await res.text();
		// 利用ガイドライン違反の判定は誤検知が多く、同じ入力でも再試行すると通ることがある
		const retryable =
			res.status === 429 || res.status >= 500 || message.includes('usage guidelines');
		if (!retryable || attempt >= MAX_ATTEMPTS) {
			throw new Error(`TTS API がエラーを返した (${res.status}): ${message}`);
		}
		await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
	}
};

const questions = parseQuestions(await readFile(inputPath, 'utf8')).filter(
	(q) => !only || only.has(q.index),
);

const jobs = paceNames.flatMap((paceName) =>
	questions.map((q) => ({
		paceName,
		question: q,
		path: join(outDir, paceName, `q${String(q.index).padStart(2, '0')}.wav`),
	})),
);

let failed = 0;
const worker = async () => {
	for (let job = jobs.shift(); job; job = jobs.shift()) {
		if (!values.force && existsSync(job.path)) {
			console.log(`skip ${job.path}`);
			continue;
		}
		try {
			const audio = await synthesize(
				`${job.question.label} ${job.question.text}`,
				PACES[job.paceName] ?? '',
			);
			await mkdir(join(outDir, job.paceName), {recursive: true});
			await writeFile(job.path, audio);
			console.log(`done ${job.path}`);
		} catch (error) {
			failed++;
			console.error(`fail ${job.path}: ${error instanceof Error ? error.message : error}`);
		}
	}
};

console.log(`プロジェクト ${project} で ${jobs.length} 件の音声を生成する`);
await Promise.all(Array.from({length: CONCURRENCY}, worker));
if (failed > 0) {
	process.exitCode = 1;
}
