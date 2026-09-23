import {describe, expect, it} from 'vitest';
import {applyCommand, createGame, projectGame} from '../../engine.ts';
import type {CommandContext, Game, Question} from '../../types.ts';
import {generateCharTypes, getCharTypesHint} from './charTypes.ts';
import {palindrome} from './index.ts';
import {
	computeOverallStandings,
	computeQuestionPenalty,
	computeQuestionStandings,
} from './scoring.ts';
import type {
	PalindromeCommand,
	PalindromeQuestionExtra,
	PalindromeQuestionRecord,
	PalindromeState,
} from './types.ts';
import {
	checkAnswer,
	getAnswerValidationError,
	isPalindromeRelaxed,
	normalizeAnswerText,
	toRelaxedHiragana,
} from './validation.ts';

const createTestGame = (questions: Question[] = []): Game<PalindromeState> => {
	const game = createGame({
		id: 'game-1',
		mode: 'palindrome',
		title: '回文クイズ',
		createdAt: 1000,
	}) as Game<PalindromeState>;
	game.questions = questions;
	game.participants = [
		{id: 'p1', name: '参加者1', joinedAt: 1000, kind: 'human'},
		{id: 'p2', name: '参加者2', joinedAt: 1000, kind: 'human'},
		{id: 'p3', name: 'AI参加者', joinedAt: 1000, kind: 'ai'},
	];
	return game;
};

const sampleQuestions: Question[] = [
	{
		id: 'q1',
		text: '',
		answer: 'まくらからくま',
		note: '司会用メモ',
		extra: {
			image: 'media-1',
			notation: '枕から熊',
			altAnswers: ['まくらからくまー'],
			hints: {
				situation: '動物がある寝具から出てきているようです。',
				irasutoya: '「枕のイラスト」、「熊のキャラクター」が使われています。',
				charTypes: '漢ああ漢',
			},
		} satisfies PalindromeQuestionExtra,
	},
	{
		id: 'q2',
		text: '',
		answer: 'とまと',
		note: '',
		extra: {
			image: 'media-2',
			notation: 'トマト',
			altAnswers: [],
			hints: {
				situation: '赤い野菜です。',
				irasutoya: '「トマトのイラスト」です。',
			},
		} satisfies PalindromeQuestionExtra,
	},
];

describe('palindrome mode - validation', () => {
	it('normalizeAnswerText は空白をすべて除去する', () => {
		expect(normalizeAnswerText(' まくら　から くま ')).toBe('まくらからくま');
	});

	it('toRelaxedHiragana は小書き文字、濁点、半濁点を正規化する', () => {
		// 小書き文字
		expect(toRelaxedHiragana('ゃ')).toBe('や');
		expect(toRelaxedHiragana('っ')).toBe('つ');
		expect(toRelaxedHiragana('ぁ')).toBe('あ');
		// 濁点
		expect(toRelaxedHiragana('が')).toBe('か');
		expect(toRelaxedHiragana('ざ')).toBe('さ');
		expect(toRelaxedHiragana('だ')).toBe('た');
		expect(toRelaxedHiragana('ば')).toBe('は');
		expect(toRelaxedHiragana('づ')).toBe('つ');
		expect(toRelaxedHiragana('ぢ')).toBe('ち');
		expect(toRelaxedHiragana('ゔ')).toBe('う');
		// 半濁点
		expect(toRelaxedHiragana('ぱ')).toBe('は');
		expect(toRelaxedHiragana('ぴ')).toBe('ひ');
		// 通常文字・長音
		expect(toRelaxedHiragana('あ')).toBe('あ');
		expect(toRelaxedHiragana('ー')).toBe('ー');
	});

	it('isPalindromeRelaxed は緩和条件で回文を判定する', () => {
		// 完全一致の回文 (奇数・偶数文字)
		expect(isPalindromeRelaxed('とまと')).toBe(true); // 3文字 (奇数)
		expect(isPalindromeRelaxed('たいいた')).toBe(true); // 4文字 (偶数)
		expect(isPalindromeRelaxed('まくらからくま')).toBe(true); // 7文字 (奇数)

		// 小書き文字の同一視 (き・ゃ・つ・や・き)
		expect(isPalindromeRelaxed('きやつやき')).toBe(true);
		// 濁点の同一視 (あさひざあ → あさひさあ)
		expect(isPalindromeRelaxed('あさひざあ')).toBe(true);
		// 半濁点の同一視 (ぱんつつんは → はんつつんは)
		expect(isPalindromeRelaxed('ぱんつつんは')).toBe(true);

		// 長音「ー」は省略とみなせない
		expect(isPalindromeRelaxed('びーるるーひ')).toBe(true); // 対称に「ー」がある
		expect(isPalindromeRelaxed('びーるるひ')).toBe(false); // 長音の省略は不可

		// 回文でない
		expect(isPalindromeRelaxed('あいうえお')).toBe(false);
		expect(isPalindromeRelaxed('しるしる')).toBe(false);
	});

	it('getAnswerValidationError は要件通りのメッセージを返す', () => {
		const answer = 'まくらからくま'; // 7文字

		// 空文字・ひらがな以外
		expect(getAnswerValidationError('', {answer})).toBe('ひらがなで入力してください');
		expect(getAnswerValidationError('枕から熊', {answer})).toBe('ひらがなで入力してください');
		expect(getAnswerValidationError('マクラからクマ', {answer})).toBe('ひらがなで入力してください');
		expect(getAnswerValidationError('makurakarakuma', {answer})).toBe('ひらがなで入力してください');

		// 文字数違い (短い・長い)
		expect(getAnswerValidationError('まくらくま', {answer})).toBe(
			'7 文字で入力してください (現在 5 文字)',
		);
		expect(getAnswerValidationError('まくらからからくま', {answer})).toBe(
			'7 文字で入力してください (現在 9 文字)',
		);

		// 回文でない
		expect(getAnswerValidationError('あいうえおかき', {answer})).toBe('回文になっていません');

		// すでに送った誤答
		expect(
			getAnswerValidationError('たいこいこいた', {
				answer,
				wrongAnswers: ['たいこいこいた'],
			}),
		).toBe('その回答はすでに送っています');

		// バリデーション通過
		expect(getAnswerValidationError('まくらからくま', {answer})).toBeNull();
		expect(getAnswerValidationError('たいこいこいた', {answer})).toBeNull();
	});

	it('checkAnswer は想定解および別解との完全一致で正誤判定を行う', () => {
		const options = {
			answer: 'まくらからくま',
			altAnswers: ['まくらはらくま'],
		};

		// 想定解
		expect(checkAnswer(' まくらからくま ', options)).toEqual({
			correct: true,
			normalized: 'まくらからくま',
		});

		// 別解
		expect(
			checkAnswer('まくらはらくま', {
				answer: 'まくらからくま',
				altAnswers: ['まくらはらくま'],
			}),
		).toEqual({
			correct: true,
			normalized: 'まくらはらくま',
		});

		// 回文だが正解ではない誤答
		expect(checkAnswer('たいこいこいた', options)).toEqual({
			correct: false,
			normalized: 'たいこいこいた',
		});

		// バリデーションエラー時は CommandError を投げる
		expect(() => checkAnswer('まくら', options)).toThrowError(
			'7 文字で入力してください (現在 3 文字)',
		);
		expect(() => checkAnswer('枕から熊', options)).toThrowError('ひらがなで入力してください');
	});
});

describe('palindrome mode - charTypes', () => {
	it('generateCharTypes は自然表記から文字種文字列を正しく生成する', () => {
		expect(generateCharTypes('枕から熊')).toBe('漢ああ漢');
		expect(generateCharTypes('トマト')).toBe('アアア');
		expect(generateCharTypes('しんぶんし')).toBe('あああああ');
		expect(generateCharTypes('UFO')).toBe('AAA');
		expect(generateCharTypes('ラーメン')).toBe('アアアア');
		expect(generateCharTypes('スキー場')).toBe('アアア漢');
		expect(generateCharTypes('すーぱー')).toBe('ああああ');
	});

	it('getCharTypesHint は手動指定を優先する', () => {
		expect(getCharTypesHint('枕から熊', '漢ああ漢')).toBe('漢ああ漢');
		expect(getCharTypesHint('トマト', undefined)).toBe('アアア');
		expect(getCharTypesHint('トマト', '')).toBe('アアア');
	});
});

describe('palindrome mode - scoring', () => {
	const participants = [
		{id: 'p1', name: '参加者1', joinedAt: 1000, kind: 'human' as const},
		{id: 'p2', name: '参加者2', joinedAt: 1000, kind: 'human' as const},
		{id: 'p3', name: '参加者3', joinedAt: 1000, kind: 'human' as const},
		{id: 'p4', name: '参加者4', joinedAt: 1000, kind: 'human' as const},
	];

	it('computeQuestionPenalty はヒントに応じたペナルティ時間を返す', () => {
		expect(computeQuestionPenalty({})).toBe(0);
		expect(computeQuestionPenalty({situation: 2000})).toBe(50_000);
		expect(computeQuestionPenalty({situation: 2000, irasutoya: 3000})).toBe(90_000);
		expect(computeQuestionPenalty({situation: 2000, irasutoya: 3000, charTypes: 4000})).toBe(
			110_000,
		);
	});

	it('computeQuestionStandings は記録時間の短い順、同時間なら誤答の少ない順に並べる', () => {
		const record: PalindromeQuestionRecord = {
			questionId: 'q1',
			openedAt: 10_000,
			closedAt: 70_000,
			participants: {
				// p1: 経過時間 30秒, ヒントなし (0秒) -> 記録 30秒, 誤答1回
				p1: {hints: {}, wrong: [{text: 'たいこからこいた', at: 20_000}], correctAt: 40_000},
				// p2: 経過時間 10秒, situation (50秒) -> 記録 60秒, 誤答0回
				p2: {hints: {situation: 15_000}, wrong: [], correctAt: 20_000},
				// p3: 経過時間 30秒, ヒントなし (0秒) -> 記録 30秒, 誤答0回 (p1より上位！)
				p3: {hints: {}, wrong: [], correctAt: 40_000},
				// p4: 未正解
				p4: {hints: {}, wrong: [{text: 'あさひさあ', at: 30_000}], correctAt: null},
			},
		};

		const standings = computeQuestionStandings(record, participants);
		// 1位: p3 (記録30秒, 誤答0)
		expect(standings[0]?.participantId).toBe('p3');
		expect(standings[0]?.rank).toBe(1);
		expect(standings[0]?.recordTimeMs).toBe(30_000);

		// 2位: p1 (記録30秒, 誤答1)
		expect(standings[1]?.participantId).toBe('p1');
		expect(standings[1]?.rank).toBe(2);
		expect(standings[1]?.recordTimeMs).toBe(30_000);

		// 3位: p2 (記録60秒, 誤答0)
		expect(standings[2]?.participantId).toBe('p2');
		expect(standings[2]?.rank).toBe(3);
		expect(standings[2]?.recordTimeMs).toBe(60_000);

		// 4位: p4 (未正解)
		expect(standings[3]?.participantId).toBe('p4');
		expect(standings[3]?.rank).toBe(4);
		expect(standings[3]?.correct).toBe(false);
	});

	it('computeOverallStandings は正解数 > 記録時間合計 > 誤答数合計 の順に並べる', () => {
		const history: PalindromeQuestionRecord[] = [
			{
				questionId: 'q1',
				openedAt: 10_000,
				closedAt: 60_000,
				participants: {
					p1: {hints: {}, wrong: [], correctAt: 20_000}, // 10秒
					p2: {hints: {}, wrong: [{text: 'a', at: 15_000}], correctAt: 25_000}, // 15秒, 誤答1
					p3: {hints: {}, wrong: [], correctAt: null},
				},
			},
			{
				questionId: 'q2',
				openedAt: 70_000,
				closedAt: 120_000,
				participants: {
					p1: {hints: {charTypes: 75_000}, wrong: [], correctAt: 80_000}, // 10秒 + 20秒 = 30秒
					p2: {hints: {}, wrong: [], correctAt: 80_000}, // 10秒
					p3: {hints: {}, wrong: [], correctAt: 80_000}, // 10秒
				},
			},
		];

		const standings = computeOverallStandings(history, participants.slice(0, 3));
		// p2: 正解2問, 記録時間 15 + 10 = 25秒, 誤答1
		// p1: 正解2問, 記録時間 10 + 30 = 40秒, 誤答0
		// p3: 正解1問
		expect(standings[0]?.participantId).toBe('p2');
		expect(standings[0]?.rank).toBe(1);
		expect(standings[0]?.correctCount).toBe(2);
		expect(standings[0]?.totalRecordTimeMs).toBe(25_000);

		expect(standings[1]?.participantId).toBe('p1');
		expect(standings[1]?.rank).toBe(2);
		expect(standings[1]?.correctCount).toBe(2);
		expect(standings[1]?.totalRecordTimeMs).toBe(40_000);

		expect(standings[2]?.participantId).toBe('p3');
		expect(standings[2]?.rank).toBe(3);
		expect(standings[2]?.correctCount).toBe(1);
	});
});

describe('palindrome mode - commands and state machine', () => {
	const hostCtx: CommandContext = {actor: {role: 'host'}, now: 10_000};
	const p1Ctx: CommandContext = {
		actor: {role: 'participant', participantId: 'p1'},
		now: 20_000,
	};
	const systemCtx: CommandContext = {actor: {role: 'system'}, now: 30_000};

	const run = (
		game: Game<PalindromeState>,
		command: PalindromeCommand,
		ctx: CommandContext,
	): Game<PalindromeState> => applyCommand(game, command, ctx) as Game<PalindromeState>;

	it('next -> close -> finish の基本進行', () => {
		let game = createTestGame(sampleQuestions);
		expect(game.state.phase).toBe('waiting');

		// 1問目出題
		game = run(game, {type: 'next'} satisfies PalindromeCommand, hostCtx);
		expect(game.state.phase).toBe('open');
		expect(game.state.history.length).toBe(1);
		expect(game.state.history[0]?.questionId).toBe('q1');
		expect(game.state.history[0]?.openedAt).toBe(10_000);
		expect(game.state.history[0]?.closedAt).toBeNull();

		// 問題終了
		game = run(game, {type: 'close'} satisfies PalindromeCommand, {
			...hostCtx,
			now: 50_000,
		});
		expect(game.state.phase).toBe('closed');
		expect(game.state.history[0]?.closedAt).toBe(50_000);

		// 出題中でない close はエラー
		expect(() => run(game, {type: 'close'} satisfies PalindromeCommand, hostCtx)).toThrow(
			'出題中の問題がありません',
		);

		// 2問目出題
		game = run(game, {type: 'next'} satisfies PalindromeCommand, {
			...hostCtx,
			now: 60_000,
		});
		expect(game.state.phase).toBe('open');
		expect(game.state.history.length).toBe(2);
		expect(game.state.history[1]?.questionId).toBe('q2');

		// 出題中に next を呼ぶと直前の問題がクローズされて次へ
		// (残り問題がないので finished へ)
		game = run(game, {type: 'next'} satisfies PalindromeCommand, {
			...hostCtx,
			now: 90_000,
		});
		expect(game.state.phase).toBe('finished');
		expect(game.state.history[1]?.closedAt).toBe(90_000);
	});

	it('openHint コマンドでヒントを開ける (重複開封は no-op、正解後はエラー)', () => {
		let game = createTestGame(sampleQuestions);
		game = run(game, {type: 'next'} satisfies PalindromeCommand, hostCtx);

		// p1 が situation ヒントを開ける
		game = run(game, {type: 'openHint', kind: 'situation'} satisfies PalindromeCommand, p1Ctx);
		const cur = game.state.history[0];
		expect(cur?.participants.p1?.hints.situation).toBe(20_000);

		// 同じヒントをもう一度開けても時刻は更新されずエラーにもならない
		game = run(game, {type: 'openHint', kind: 'situation'} satisfies PalindromeCommand, {
			...p1Ctx,
			now: 25_000,
		});
		expect(game.state.history[0]?.participants.p1?.hints.situation).toBe(20_000);

		// AI (system) が p3 の代理でヒントを開ける
		game = run(
			game,
			{type: 'openHint', kind: 'charTypes', participantId: 'p3'} satisfies PalindromeCommand,
			systemCtx,
		);
		expect(game.state.history[0]?.participants.p3?.hints.charTypes).toBe(30_000);
	});

	it('answer コマンドで正解・誤答・バリデーション拒否', () => {
		let game = createTestGame(sampleQuestions);
		game = run(game, {type: 'next'} satisfies PalindromeCommand, hostCtx);

		// バリデーションエラーの回答 (文字数違い) -> CommandError で拒否され、誤答に記録されない
		expect(() =>
			run(game, {type: 'answer', text: 'まくらくま'} satisfies PalindromeCommand, p1Ctx),
		).toThrow('7 文字で入力してください (現在 5 文字)');
		expect(game.state.history[0]?.participants.p1?.wrong.length).toBe(0);

		// 回文だが不正解の誤答 (7文字)
		game = run(game, {type: 'answer', text: 'たいこいこいた'} satisfies PalindromeCommand, p1Ctx);
		expect(game.state.history[0]?.participants.p1?.wrong).toEqual([
			{text: 'たいこいこいた', at: 20_000},
		]);
		expect(game.state.history[0]?.participants.p1?.correctAt).toBeNull();

		// 同じ誤答を再度送る -> CommandError
		expect(() =>
			run(game, {type: 'answer', text: 'たいこいこいた'} satisfies PalindromeCommand, {
				...p1Ctx,
				now: 22_000,
			}),
		).toThrow('その回答はすでに送っています');

		// 正解の回答
		game = run(game, {type: 'answer', text: 'まくらからくま'} satisfies PalindromeCommand, {
			...p1Ctx,
			now: 25_000,
		});
		expect(game.state.history[0]?.participants.p1?.correctAt).toBe(25_000);

		// 正解後に再度回答するとエラー
		expect(() =>
			run(game, {type: 'answer', text: 'まくらからくま'} satisfies PalindromeCommand, {
				...p1Ctx,
				now: 26_000,
			}),
		).toThrow('既に正解しています');

		// 正解後にヒントを開けようとするとエラー
		expect(() =>
			run(game, {type: 'openHint', kind: 'charTypes'} satisfies PalindromeCommand, {
				...p1Ctx,
				now: 27_000,
			}),
		).toThrow('既に正解しています');
	});

	it('showStandings コマンドでフラグを切り替える', () => {
		let game = createTestGame(sampleQuestions);
		expect(game.state.showStandings).toBe(false);

		game = run(game, {type: 'showStandings', show: true} satisfies PalindromeCommand, hostCtx);
		expect(game.state.showStandings).toBe(true);

		game = run(game, {type: 'showStandings', show: false} satisfies PalindromeCommand, hostCtx);
		expect(game.state.showStandings).toBe(false);
	});
});

describe('palindrome mode - projection (情報秘匿)', () => {
	const run = (
		game: Game<PalindromeState>,
		command: PalindromeCommand,
		ctx: CommandContext,
	): Game<PalindromeState> => applyCommand(game, command, ctx) as Game<PalindromeState>;
	const project = (
		game: Game<PalindromeState>,
		viewer: Parameters<typeof projectGame>[1],
	): Game<PalindromeState> => projectGame(game, viewer) as Game<PalindromeState>;

	it('出題中・終了後で参加者・モニターへの投影が正しく絞られる', () => {
		let game = createTestGame(sampleQuestions);
		// 1問目出題
		game = run(game, {type: 'next'} satisfies PalindromeCommand, {
			actor: {role: 'host'},
			now: 10_000,
		});

		// p1 が situation ヒントを開け、誤答1回 (7文字)
		game = run(game, {type: 'openHint', kind: 'situation'} satisfies PalindromeCommand, {
			actor: {role: 'participant', participantId: 'p1'},
			now: 15_000,
		});
		game = run(game, {type: 'answer', text: 'たいこいこいた'} satisfies PalindromeCommand, {
			actor: {role: 'participant', participantId: 'p1'},
			now: 20_000,
		});

		// p2 は誤答1回 (ヒント開けず, 7文字)
		game = run(game, {type: 'answer', text: 'あさひさひさあ'} satisfies PalindromeCommand, {
			actor: {role: 'participant', participantId: 'p2'},
			now: 22_000,
		});

		// --- 出題中の投影確認 ---

		// 1. 司会者 (host): すべての情報が見える
		const hostView = project(game, {role: 'host'});
		expect(hostView.questions.length).toBe(2);
		const hostQ0 = hostView.questions[0];
		expect(hostQ0?.answer).toBe('まくらからくま');
		expect(hostQ0?.note).toBe('司会用メモ');
		const hostExtra = hostQ0?.extra as PalindromeQuestionExtra | undefined;
		expect(hostExtra?.notation).toBe('枕から熊');
		expect(hostView.state.history[0]?.participants.p1?.wrong[0]?.text).toBe('たいこいこいた');

		// 2. モニター (monitor): 未出題は非表示、出題中の答え・ヒント本文・回答本文は隠される
		const monitorView = project(game, {role: 'monitor'});
		expect(monitorView.questions.length).toBe(1); // q2は未出題なので除外
		const monitorQ0 = monitorView.questions[0];
		expect(monitorQ0?.answer).toBe(''); // 答えは隠される
		expect(monitorQ0?.note).toBe('');
		const monitorExtra = monitorQ0?.extra as
			| {charCount?: number; notation?: string; hints?: Record<string, string>}
			| undefined;
		expect(monitorExtra?.charCount).toBe(7); // 文字数は見える
		expect(monitorExtra?.notation).toBeUndefined();
		expect(monitorExtra?.hints).toEqual({}); // ヒント本文なし
		// 回答本文は空文字列に伏せられる
		expect(monitorView.state.history[0]?.participants.p1?.wrong[0]?.text).toBe('');
		expect(monitorView.state.history[0]?.participants.p2?.wrong[0]?.text).toBe('');

		// 3. 参加者 p1 (participant):
		const p1View = project(game, {role: 'participant', participantId: 'p1'});
		expect(p1View.questions.length).toBe(1);
		const p1Q0 = p1View.questions[0];
		expect(p1Q0?.answer).toBe('');
		const p1Extra = p1Q0?.extra as {charCount?: number; hints?: Record<string, string>} | undefined;
		expect(p1Extra?.charCount).toBe(7);
		// 自分が開けた situation ヒントの本文だけが含まれ、開けていない irasutoya や charTypes は含まれない
		const p1Hints = p1Extra?.hints;
		expect(p1Hints?.situation).toBe('動物がある寝具から出てきているようです。');
		expect(p1Hints?.irasutoya).toBeUndefined();
		expect(p1Hints?.charTypes).toBeUndefined();
		// 自分の誤答本文は見え、他人の誤答本文は伏せられる
		expect(p1View.state.history[0]?.participants.p1?.wrong[0]?.text).toBe('たいこいこいた');
		expect(p1View.state.history[0]?.participants.p2?.wrong[0]?.text).toBe('');

		// --- 問題終了後の投影確認 ---
		game = run(game, {type: 'close'} satisfies PalindromeCommand, {
			actor: {role: 'host'},
			now: 50_000,
		});

		const closedMonitorView = project(game, {role: 'monitor'});
		const closedQ0 = closedMonitorView.questions[0];
		expect(closedQ0?.answer).toBe('まくらからくま'); // 答え解禁
		const closedExtra = closedQ0?.extra as
			| {notation?: string; hints?: Record<string, string>}
			| undefined;
		expect(closedExtra?.notation).toBe('枕から熊');
		expect(closedExtra?.hints?.situation).toBe('動物がある寝具から出てきているようです。');
		expect(closedExtra?.hints?.charTypes).toBe('漢ああ漢');
	});

	it('describeCommand がコマンドの説明文を正しく生成する', () => {
		const game = createTestGame(sampleQuestions);
		const {describe: describeFn} = palindrome;

		expect(describeFn({type: 'next'}, game)).toBe('次の問題へ');
		expect(describeFn({type: 'close'}, game)).toBe('問題を終了');
		expect(describeFn({type: 'finish'}, game)).toBe('企画を終了');
		expect(describeFn({type: 'showStandings', show: true}, game)).toBe('総合順位を表示');
		expect(describeFn({type: 'showStandings', show: false}, game)).toBe('総合順位を非表示');
		expect(describeFn({type: 'openHint', kind: 'situation', participantId: 'p1'}, game)).toBe(
			'参加者1さんが状況説明ヒントを開けた',
		);
		expect(describeFn({type: 'openHint', kind: 'irasutoya', participantId: 'p2'}, game)).toBe(
			'参加者2さんがいらすとやヒントを開けた',
		);
		expect(describeFn({type: 'openHint', kind: 'charTypes', participantId: 'p3'}, game)).toBe(
			'AI参加者さんが文字種ヒントを開けた',
		);
		expect(describeFn({type: 'answer', text: 'まくらからくま', participantId: 'p1'}, game)).toBe(
			'参加者1さんの回答',
		);
	});

	it('system actor (AI) による answer コマンドが動作する', () => {
		let game = createTestGame(sampleQuestions);
		game = run(game, {type: 'next'} satisfies PalindromeCommand, {
			actor: {role: 'host'},
			now: 10_000,
		});

		// participantId なしの system answer はエラー
		expect(() =>
			run(game, {type: 'answer', text: 'まくらからくま'} satisfies PalindromeCommand, {
				actor: {role: 'system'},
				now: 20_000,
			}),
		).toThrow('participantId が指定されていません');

		// participantId ありの system answer
		game = run(
			game,
			{
				type: 'answer',
				text: 'まくらからくま',
				participantId: 'p3',
			} satisfies PalindromeCommand,
			{actor: {role: 'system'}, now: 20_000},
		);
		expect(game.state.history[0]?.participants.p3?.correctAt).toBe(20_000);
	});
});
