import {describe, expect, it} from 'vitest';
import {applyCommand, createGame, describeCommand, projectGame} from '../../engine.ts';
import type {Actor, Game, Question, Viewer} from '../../types.ts';
import {isAccepting, palindrome} from './index.ts';
import {computeQuestionSummary, computeStandings, questionLabel} from './scoring.ts';
import type {PalindromeQuestionExtra, PalindromeState} from './types.ts';

const MIN = 60_000;

const question = (
	id: string,
	answer: string,
	notation: string,
	altAnswers: string[] = [],
): Question => ({
	id,
	text: '',
	answer,
	note: '司会用メモ',
	extra: {
		image: `media-${id}`,
		notation,
		altAnswers,
		hints: {situation: `${id} の状況`, irasutoya: `${id} の素材`},
	} satisfies PalindromeQuestionExtra,
});

const sampleQuestions: Question[] = [
	question('q1', 'まくらからくま', '枕から熊', ['まくらがらくま']),
	question('q2', 'とまと', 'トマト'),
	question('q3', 'たいいた', '鯛板'),
];

const createTestGame = (questions: Question[] = sampleQuestions): Game<PalindromeState> => {
	const game = createGame({
		id: 'game-1',
		mode: 'palindrome',
		title: '回文クイズ',
		createdAt: 0,
	}) as Game<PalindromeState>;
	game.questions = structuredClone(questions);
	game.participants = [
		{id: 'p1', name: '参加者1', joinedAt: 0, kind: 'human'},
		{id: 'p2', name: '参加者2', joinedAt: 0, kind: 'human'},
		{id: 'p3', name: 'AI', joinedAt: 0, kind: 'ai'},
	];
	return game;
};

const host: Actor = {role: 'host'};
const p = (participantId: string): Actor => ({role: 'participant', participantId});

const run = (game: Game<PalindromeState>, command: unknown, now: number, actor: Actor = host) =>
	applyCommand(game, command, {now, actor}) as Game<PalindromeState>;

/** 10 分のコンテストを時刻 1000 に始めたゲーム */
const startedGame = () => {
	let game = createTestGame();
	game = run(game, {type: 'setDuration', minutes: 10}, 0);
	return run(game, {type: 'start'}, 1000);
};

const project = (game: Game<PalindromeState>, viewer: Viewer) =>
	projectGame(game, viewer) as Game<PalindromeState>;

describe('palindrome - コンテストの進行', () => {
	it('初期状態は開始前で、既定の制限時間は 30 分', () => {
		const {state} = createTestGame();
		expect(state.phase).toBe('waiting');
		expect(state.durationMs).toBe(30 * MIN);
		expect(state.questionIds).toEqual([]);
	});

	it('start で開始時刻・終了予定時刻・問題の並びを確定する', () => {
		const {state} = startedGame();
		expect(state.phase).toBe('running');
		expect(state.startedAt).toBe(1000);
		expect(state.endsAt).toBe(1000 + 10 * MIN);
		expect(state.questionIds).toEqual(['q1', 'q2', 'q3']);
	});

	it('問題がなければ開始できず、開始後は制限時間の変更も再開始もできない', () => {
		expect(() => run(createTestGame([]), {type: 'start'}, 0)).toThrow('問題がありません');
		const game = startedGame();
		expect(() => run(game, {type: 'setDuration', minutes: 5}, 2000)).toThrow();
		expect(() => run(game, {type: 'start'}, 2000)).toThrow('すでに始まっています');
	});

	it('参加者は開始・延長・終了を実行できない', () => {
		expect(() => run(createTestGame(), {type: 'start'}, 0, p('p1'))).toThrow('権限');
	});

	it('開始前の回答とヒントは拒否する', () => {
		const game = createTestGame();
		expect(() => run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 0, p('p1'))).toThrow(
			'まだ始まっていません',
		);
		expect(() =>
			run(game, {type: 'openHint', questionId: 'q2', kind: 'situation'}, 0, p('p1')),
		).toThrow('まだ始まっていません');
	});

	it('終了予定時刻を過ぎた回答とヒントは finish の前でも拒否する', () => {
		const game = startedGame();
		const endsAt = 1000 + 10 * MIN;
		expect(isAccepting(game.state, endsAt - 1)).toBe(true);
		expect(isAccepting(game.state, endsAt)).toBe(false);
		run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, endsAt - 1, p('p1'));
		expect(() =>
			run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, endsAt, p('p1')),
		).toThrow('終了しました');
		expect(() =>
			run(game, {type: 'openHint', questionId: 'q2', kind: 'situation'}, endsAt, p('p1')),
		).toThrow('終了しました');
	});

	it('extend で終了予定時刻を延ばすと、延ばした分だけ受け付ける', () => {
		let game = startedGame();
		const endsAt = 1000 + 10 * MIN;
		game = run(game, {type: 'extend', minutes: 5}, 2000);
		expect(game.state.endsAt).toBe(endsAt + 5 * MIN);
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, endsAt + MIN, p('p1'));
		expect(game.state.attempts.q2?.p1?.correctAt).toBe(endsAt + MIN);
		// 時間切れの後は延長できない
		expect(() => run(game, {type: 'extend', minutes: 1}, endsAt + 5 * MIN)).toThrow();
	});

	it('finish で途中で打ち切ると、それ以降は受け付けない', () => {
		let game = startedGame();
		game = run(game, {type: 'finish'}, 5000);
		expect(game.state.phase).toBe('finished');
		expect(game.state.finishedAt).toBe(5000);
		expect(() =>
			run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 6000, p('p1')),
		).toThrow('終了しました');
		expect(() => run(game, {type: 'finish'}, 7000)).toThrow();
	});

	it('時間切れの後の finish では、終了時刻は終了予定時刻になる', () => {
		const game = run(startedGame(), {type: 'finish'}, 1000 + 20 * MIN);
		expect(game.state.finishedAt).toBe(1000 + 10 * MIN);
	});

	it('開始後に追加した問題はコンテストに含まれず、回答できない', () => {
		let game = startedGame();
		game = run(
			game,
			{
				type: 'questions.add',
				question: {...question('q4', 'しんぶんし', '新聞紙')},
			},
			2000,
		);
		expect(() =>
			run(game, {type: 'answer', questionId: 'q4', text: 'しんぶんし'}, 3000, p('p1')),
		).toThrow('問題が見つかりません');
	});
});

describe('palindrome - 回答とヒント', () => {
	it('好きな問題に回答でき、正解・誤答を記録する (別解も正解)', () => {
		let game = startedGame();
		game = run(game, {type: 'answer', questionId: 'q3', text: 'かいいか'}, 2000, p('p1'));
		game = run(game, {type: 'answer', questionId: 'q3', text: 'たいいた'}, 3000, p('p1'));
		game = run(game, {type: 'answer', questionId: 'q1', text: 'まくらがらくま'}, 4000, p('p2'));
		expect(game.state.attempts.q3?.p1).toEqual({
			hints: {},
			wrong: [{text: 'かいいか', at: 2000}],
			correctAt: 3000,
		});
		expect(game.state.attempts.q1?.p2?.correctAt).toBe(4000);
	});

	it('検証エラーの回答は拒否し、誤答に数えない', () => {
		let game = startedGame();
		expect(() =>
			run(game, {type: 'answer', questionId: 'q2', text: 'トマト'}, 2000, p('p1')),
		).toThrow('ひらがな');
		expect(() =>
			run(game, {type: 'answer', questionId: 'q2', text: 'とまとと'}, 2000, p('p1')),
		).toThrow('3 文字');
		game = run(game, {type: 'answer', questionId: 'q2', text: 'たまた'}, 2000, p('p1'));
		expect(() =>
			run(game, {type: 'answer', questionId: 'q2', text: 'たまた'}, 3000, p('p1')),
		).toThrow('すでに送っています');
		expect(game.state.attempts.q2?.p1?.wrong).toHaveLength(1);
	});

	it('正解した問題には回答もヒントもできない', () => {
		const game = run(
			startedGame(),
			{type: 'answer', questionId: 'q2', text: 'とまと'},
			2000,
			p('p1'),
		);
		expect(() =>
			run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 3000, p('p1')),
		).toThrow('既に正解しています');
		expect(() =>
			run(game, {type: 'openHint', questionId: 'q2', kind: 'charTypes'}, 3000, p('p1')),
		).toThrow('既に正解しています');
	});

	it('ヒントは問題ごと・参加者ごとに開き、2回目は何もしない', () => {
		let game = startedGame();
		game = run(game, {type: 'openHint', questionId: 'q1', kind: 'charTypes'}, 2000, p('p1'));
		game = run(game, {type: 'openHint', questionId: 'q1', kind: 'charTypes'}, 3000, p('p1'));
		expect(game.state.attempts.q1?.p1?.hints).toEqual({charTypes: 2000});
		expect(game.state.attempts.q2?.p1).toBeUndefined();
		expect(game.state.attempts.q1?.p2).toBeUndefined();
	});

	it('system (AI の代理) は participantId を指定して回答できる', () => {
		let game = startedGame();
		const system: Actor = {role: 'system'};
		game = run(
			game,
			{type: 'openHint', questionId: 'q2', kind: 'situation', participantId: 'p3'},
			2000,
			system,
		);
		game = run(
			game,
			{type: 'answer', questionId: 'q2', text: 'とまと', participantId: 'p3'},
			3000,
			system,
		);
		expect(game.state.attempts.q2?.p3).toEqual({
			hints: {situation: 2000},
			wrong: [],
			correctAt: 3000,
		});
		expect(() =>
			run(game, {type: 'answer', questionId: 'q1', text: 'まくらからくま'}, 3000, system),
		).toThrow('participantId');
		expect(() =>
			run(
				game,
				{type: 'answer', questionId: 'q1', text: 'まくらからくま', participantId: 'nobody'},
				3000,
				system,
			),
		).toThrow('登録されていません');
	});

	it('司会者やモニターは回答できない', () => {
		expect(() =>
			run(startedGame(), {type: 'answer', questionId: 'q2', text: 'とまと'}, 2000, host),
		).toThrow('権限');
	});
});

describe('palindrome - 順位', () => {
	const standingsOf = (game: Game<PalindromeState>) =>
		computeStandings(game.state, game.participants).map((s) => ({
			id: s.participantId,
			rank: s.rank,
			solved: s.solvedCount,
			time: s.scoreTimeMs,
			wrong: s.wrongCount,
		}));

	it('正答数の多い順 → 最終正答時間 + ペナルティの短い順 → 誤答数の少ない順', () => {
		let game = startedGame();
		// p1: 2 問正解 (最終 5 分)。ペナルティなし
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + MIN, p('p1'));
		game = run(game, {type: 'answer', questionId: 'q3', text: 'たいいた'}, 1000 + 5 * MIN, p('p1'));
		// p2: 2 問正解 (最終 4 分) で文字種ヒント 2 つ (+40 秒)
		game = run(game, {type: 'openHint', questionId: 'q2', kind: 'charTypes'}, 1000, p('p2'));
		game = run(game, {type: 'openHint', questionId: 'q3', kind: 'charTypes'}, 1000, p('p2'));
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + 2 * MIN, p('p2'));
		game = run(game, {type: 'answer', questionId: 'q3', text: 'たいいた'}, 1000 + 4 * MIN, p('p2'));
		// p3: 1 問正解
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + 30_000, p('p3'));

		expect(standingsOf(game)).toEqual([
			{id: 'p2', rank: 1, solved: 2, time: 4 * MIN + 40_000, wrong: 0},
			{id: 'p1', rank: 2, solved: 2, time: 5 * MIN, wrong: 0},
			{id: 'p3', rank: 3, solved: 1, time: 30_000, wrong: 0},
		]);
	});

	it('時間が同じなら誤答数の少ない順。すべて同じなら同順位', () => {
		let game = startedGame();
		game = run(game, {type: 'answer', questionId: 'q2', text: 'たまた'}, 1000, p('p1'));
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + MIN, p('p1'));
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + MIN, p('p2'));
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + MIN, p('p3'));
		expect(standingsOf(game).map((s) => [s.id, s.rank])).toEqual([
			['p2', 1],
			['p3', 1],
			['p1', 3],
		]);
	});

	it('未正解の問題で開けたヒントと誤答は順位に影響しない', () => {
		let game = startedGame();
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + MIN, p('p1'));
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + MIN, p('p2'));
		// p2 は q1 でヒントを全部開けて誤答したが、正解していない
		for (const kind of ['situation', 'irasutoya', 'charTypes']) {
			game = run(game, {type: 'openHint', questionId: 'q1', kind}, 2000, p('p2'));
		}
		game = run(game, {type: 'answer', questionId: 'q1', text: 'たいこいこいた'}, 3000, p('p2'));

		const [first, second] = computeStandings(game.state, game.participants);
		expect(first?.rank).toBe(1);
		expect(second?.rank).toBe(1);
		const p2 = computeStandings(game.state, game.participants).find(
			(s) => s.participantId === 'p2',
		);
		expect(p2?.penaltyMs).toBe(0);
		expect(p2?.wrongCount).toBe(0);
		// 表示用のセルには未正解の問題の誤答とヒントも残る
		expect(p2?.cells.q1).toMatchObject({solved: false, wrongCount: 1, penaltyMs: 110_000});
	});

	it('セルには開始からの経過時間と最初の正解者の印が付く', () => {
		let game = startedGame();
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + 2 * MIN, p('p1'));
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + MIN, p('p2'));
		const standings = computeStandings(game.state, game.participants);
		const cell = (id: string) => standings.find((s) => s.participantId === id)?.cells.q2;
		expect(cell('p1')).toMatchObject({solved: true, elapsedMs: 2 * MIN, firstSolver: false});
		expect(cell('p2')).toMatchObject({solved: true, elapsedMs: MIN, firstSolver: true});
		expect(cell('p3')).toMatchObject({solved: false, elapsedMs: null, firstSolver: false});
	});

	it('削除された参加者は順位に含めない', () => {
		let game = startedGame();
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 2000, p('p1'));
		game = run(game, {type: 'participants.remove', participantId: 'p1'}, 3000);
		expect(computeStandings(game.state, game.participants).map((s) => s.participantId)).toEqual([
			'p2',
			'p3',
		]);
	});

	it('computeQuestionSummary は正解順の一覧と最初の正解者を返す', () => {
		let game = startedGame();
		game = run(game, {type: 'openHint', questionId: 'q2', kind: 'irasutoya'}, 1000, p('p1'));
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + 2 * MIN, p('p1'));
		game = run(game, {type: 'answer', questionId: 'q2', text: 'とまと'}, 1000 + MIN, p('p2'));
		game = run(game, {type: 'answer', questionId: 'q2', text: 'たまた'}, 1000, p('p3'));
		const summary = computeQuestionSummary(game.state, 'q2', game.participants);
		expect(summary.solvers.map((s) => [s.participantId, s.elapsedMs, s.penaltyMs])).toEqual([
			['p2', MIN, 0],
			['p1', 2 * MIN, 40_000],
		]);
		expect(summary.firstSolverIds).toEqual(['p2']);
		expect(summary.unsolvedTriedCount).toBe(1);
	});

	it('questionLabel は A, B, C… と番号を振る', () => {
		expect(questionLabel(0)).toBe('A');
		expect(questionLabel(25)).toBe('Z');
		expect(questionLabel(26)).toBe('27');
	});
});

describe('palindrome - 投影', () => {
	const extraOf = (q: Question | undefined) => q?.extra as Record<string, unknown> | undefined;

	it('開始前は参加者とモニターに問題を送らない', () => {
		const game = createTestGame();
		expect(project(game, {role: 'monitor'}).questions).toEqual([]);
		expect(project(game, {role: 'participant', participantId: 'p1'}).questions).toEqual([]);
		expect(project(game, {role: 'host'}).questions).toHaveLength(3);
	});

	it('開催中は答え・表記・別解を隠し、参加者本人が開けたヒントだけを送る', () => {
		let game = startedGame();
		game = run(game, {type: 'openHint', questionId: 'q1', kind: 'charTypes'}, 2000, p('p1'));
		game = run(game, {type: 'answer', questionId: 'q1', text: 'たいこいこいた'}, 3000, p('p1'));

		const monitor = project(game, {role: 'monitor'});
		expect(monitor.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
		expect(monitor.questions[0]?.answer).toBe('');
		expect(monitor.questions[0]?.note).toBe('');
		expect(extraOf(monitor.questions[0])).toEqual({image: 'media-q1', charCount: 7, hints: {}});
		expect(monitor.state.attempts.q1?.p1?.wrong).toEqual([{text: '', at: 3000}]);
		expect(monitor.state.attempts.q1?.p1?.hints).toEqual({charTypes: 2000});

		const p1 = project(game, {role: 'participant', participantId: 'p1'});
		expect(extraOf(p1.questions[0])?.hints).toEqual({charTypes: '漢ああ漢'});
		expect(extraOf(p1.questions[1])?.hints).toEqual({});
		expect(p1.state.attempts.q1?.p1?.wrong).toEqual([{text: 'たいこいこいた', at: 3000}]);

		const p2 = project(game, {role: 'participant', participantId: 'p2'});
		expect(extraOf(p2.questions[0])?.hints).toEqual({});
		expect(p2.state.attempts.q1?.p1?.wrong).toEqual([{text: '', at: 3000}]);

		const hostView = project(game, {role: 'host'});
		expect(hostView.questions[0]?.answer).toBe('まくらからくま');
		expect(hostView.state.attempts.q1?.p1?.wrong[0]?.text).toBe('たいこいこいた');
	});

	it('終了後と感想戦中は答えと全ヒントを公開する (他人の誤答の本文は隠したまま)', () => {
		let game = startedGame();
		game = run(game, {type: 'answer', questionId: 'q1', text: 'たいこいこいた'}, 3000, p('p1'));
		game = run(game, {type: 'finish'}, 4000);
		const monitor = project(game, {role: 'monitor'});
		expect(monitor.questions[0]?.answer).toBe('まくらからくま');
		expect(monitor.questions[0]?.note).toBe('');
		expect(extraOf(monitor.questions[0])).toEqual({
			image: 'media-q1',
			notation: '枕から熊',
			altAnswers: ['まくらがらくま'],
			charCount: 7,
			hints: {situation: 'q1 の状況', irasutoya: 'q1 の素材', charTypes: '漢ああ漢'},
		});
		expect(monitor.state.attempts.q1?.p1?.wrong).toEqual([{text: '', at: 3000}]);

		game = run(game, {type: 'review.start'}, 5000);
		expect(project(game, {role: 'monitor'}).questions[1]?.answer).toBe('とまと');
	});
});

describe('palindrome - 感想戦と説明', () => {
	it('reviewItems はコンテストの問題の並び', () => {
		const game = startedGame();
		expect(palindrome.reviewItems?.(createTestGame())).toEqual([]);
		expect(palindrome.reviewItems?.(game)).toEqual([
			{questionId: 'q1', recordIndex: 0},
			{questionId: 'q2', recordIndex: 1},
			{questionId: 'q3', recordIndex: 2},
		]);
		let reviewing = run(run(game, {type: 'finish'}, 2000), {type: 'review.start'}, 3000);
		reviewing = run(reviewing, {type: 'review.move', index: 5}, 4000);
		expect(reviewing.review).toEqual({index: 2});
	});

	it('askedQuestionIds は開始後の問題', () => {
		expect(palindrome.askedQuestionIds?.(createTestGame())).toEqual(new Set());
		expect(palindrome.askedQuestionIds?.(startedGame())).toEqual(new Set(['q1', 'q2', 'q3']));
	});

	it('describe はコマンドの説明を返す', () => {
		const game = startedGame();
		expect(describeCommand(game, {type: 'start'} as {type: string})).toBe('コンテストを開始');
		expect(describeCommand(game, {type: 'extend', minutes: 5} as {type: string})).toBe('5 分延長');
		expect(
			describeCommand(game, {type: 'openHint', questionId: 'q2', kind: 'charTypes'} as {
				type: string;
			}),
		).toBe('問題 B の文字種ヒントを開けた');
		expect(
			describeCommand(game, {
				type: 'answer',
				questionId: 'q1',
				text: 'x',
				participantId: 'p3',
			} as {type: string}),
		).toBe('AIさんが問題 A に回答');
	});
});
