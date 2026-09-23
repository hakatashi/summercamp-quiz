import {describe, expect, it} from 'vitest';
import {z} from 'zod';
import {isUndoableCommandType} from './commands.ts';
import {applyCommand, createGame, fillCommandIds, parseCommand} from './engine.ts';
import {modes} from './modes/registry.ts';
import type {Actor, Game} from './types.ts';

const host: Actor = {role: 'host'};
const ctx = {now: 0, actor: host};

describe('共通コマンド', () => {
	const base = () => createGame({id: 'g', mode: 'simple-buzzer', title: 't', createdAt: 0});
	const withQuestions = (): Game =>
		applyCommand(
			base(),
			{
				type: 'questions.import',
				replace: false,
				questions: ['a', 'b', 'c'].map((id) => ({id, text: id, answer: id})),
			},
			ctx,
		);

	it('元の game を書き換えない', () => {
		const game = base();
		applyCommand(game, {type: 'game.rename', title: 'new'}, ctx);
		expect(game.title).toBe('t');
	});

	it('問題の追加、編集、移動、削除', () => {
		let game = withQuestions();
		game = applyCommand(
			game,
			{type: 'questions.add', question: {id: 'x', text: 'X', answer: 'x'}, index: 1},
			ctx,
		);
		expect(game.questions.map((q) => q.id)).toEqual(['a', 'x', 'b', 'c']);
		game = applyCommand(game, {type: 'questions.update', id: 'x', answer: 'エックス'}, ctx);
		expect(game.questions[1]).toMatchObject({text: 'X', answer: 'エックス', note: ''});
		game = applyCommand(game, {type: 'questions.move', id: 'a', toIndex: 3}, ctx);
		expect(game.questions.map((q) => q.id)).toEqual(['x', 'b', 'c', 'a']);
		game = applyCommand(game, {type: 'questions.delete', id: 'b'}, ctx);
		expect(game.questions.map((q) => q.id)).toEqual(['x', 'c', 'a']);
	});

	it('ID のない問題はサーバーで ID を振る', () => {
		let n = 0;
		const command = fillCommandIds(
			{type: 'questions.add', question: {text: 'Q', answer: 'A'}},
			() => `id${++n}`,
		);
		const game = applyCommand(base(), command, ctx);
		expect(game.questions[0]?.id).toBe('id1');
		expect(() =>
			applyCommand(base(), {type: 'questions.add', question: {text: 'Q', answer: 'A'}}, ctx),
		).toThrow('問題 ID');
	});

	it('next コマンドには乱数シードを埋める', () => {
		const filled = fillCommandIds(
			{type: 'next'},
			() => 'id',
			() => 9999,
		);
		expect(filled).toMatchObject({type: 'next', seed: 9999});
	});

	it('同じ名前では参加できない', () => {
		const system: Actor = {role: 'system'};
		const game = applyCommand(
			base(),
			{type: 'participants.join', participantId: 'p1', name: 'Alice'},
			{now: 0, actor: system},
		);
		expect(() =>
			applyCommand(
				game,
				{type: 'participants.join', participantId: 'p2', name: 'Alice'},
				{now: 0, actor: system},
			),
		).toThrow('同じ名前');
	});

	it('参加登録は司会者でもできない (サーバーだけ)', () => {
		expect(() =>
			applyCommand(base(), {type: 'participants.join', participantId: 'p', name: 'x'}, ctx),
		).toThrow('権限');
	});

	it('不正なコマンドを拒否する', () => {
		expect(() => applyCommand(base(), {type: 'unknown'}, ctx)).toThrow('不正');
		expect(() => applyCommand(base(), {type: 'questions.delete'}, ctx)).toThrow('不正');
		expect(() => applyCommand(base(), 'hello', ctx)).toThrow('不正');
	});
});

describe('感想戦コマンド', () => {
	const system: Actor = {role: 'system'};
	const player: Actor = {role: 'participant', participantId: 'p1'};

	const setupGameWithQuestions = () => {
		let game = createGame({id: 'g', mode: 'simple-buzzer', title: 't', createdAt: 0});
		game = applyCommand(
			game,
			{
				type: 'questions.import',
				replace: true,
				questions: [
					{id: 'q1', text: '問題1', answer: '答え1'},
					{id: 'q2', text: '問題2', answer: '答え2'},
					{id: 'q3', text: '問題3', answer: '答え3'},
				],
			},
			ctx,
		);
		game = applyCommand(
			game,
			{type: 'participants.join', participantId: 'p1', name: 'Alice'},
			{now: 0, actor: system},
		);
		return game;
	};

	it('初期状態では review は null', () => {
		const game = createGame({id: 'g', mode: 'simple-buzzer', title: 't', createdAt: 0});
		expect(game.review).toBeNull();
	});

	it('出題がないときは感想戦を開始できない', () => {
		const game = setupGameWithQuestions();
		expect(() => applyCommand(game, {type: 'review.start'}, ctx)).toThrow(
			'振り返る項目がありません',
		);
	});

	it('出題後に感想戦を開始・移動・終了でき、範囲外の移動は端に丸められる', () => {
		let game = setupGameWithQuestions();
		// 1問目出題 -> 正解
		game = applyCommand(game, {type: 'next'}, ctx);
		game = applyCommand(game, {type: 'buzz', pressedAt: 100}, {now: 100, actor: player});
		game = applyCommand(game, {type: 'judge', correct: true}, ctx);
		// 2問目出題 -> 正解
		game = applyCommand(game, {type: 'next'}, ctx);
		game = applyCommand(game, {type: 'buzz', pressedAt: 200}, {now: 200, actor: player});
		game = applyCommand(game, {type: 'judge', correct: true}, ctx);
		// 3問目出題 -> スルー
		game = applyCommand(game, {type: 'next'}, ctx);
		game = applyCommand(game, {type: 'close'}, ctx);

		const beforeReview = structuredClone(game);

		// 感想戦を開始 (index: 0)
		game = applyCommand(game, {type: 'review.start'}, ctx);
		expect(game.review).toEqual({index: 0});

		// 次へ移動
		game = applyCommand(game, {type: 'review.move', index: 1}, ctx);
		expect(game.review).toEqual({index: 1});

		// 上限を超える移動は末尾 (index: 2) に丸められる
		game = applyCommand(game, {type: 'review.move', index: 100}, ctx);
		expect(game.review).toEqual({index: 2});

		// 下限を下回る移動は先頭 (index: 0) に丸められる
		game = applyCommand(game, {type: 'review.move', index: -5}, ctx);
		expect(game.review).toEqual({index: 0});

		// 感想戦を終了
		game = applyCommand(game, {type: 'review.end'}, ctx);
		expect(game.review).toBeNull();

		// 感想戦の前後に本戦の状態 (得点や出題履歴など) が変わらない
		expect(game.state).toEqual(beforeReview.state);
		expect(game.questions).toEqual(beforeReview.questions);
		expect(game.participants).toEqual(beforeReview.participants);
	});

	it('感想戦中ではないときに review.move はできない', () => {
		let game = setupGameWithQuestions();
		game = applyCommand(game, {type: 'next'}, ctx);
		game = applyCommand(game, {type: 'close'}, ctx);
		expect(() => applyCommand(game, {type: 'review.move', index: 0}, ctx)).toThrow(
			'感想戦中ではありません',
		);
	});

	it('参加者は感想戦コマンドを実行できない', () => {
		let game = setupGameWithQuestions();
		game = applyCommand(game, {type: 'next'}, ctx);
		game = applyCommand(game, {type: 'close'}, ctx);

		const playerCtx = {now: 0, actor: player};
		expect(() => applyCommand(game, {type: 'review.start'}, playerCtx)).toThrow('権限');
	});

	it('企画で reviewPermissions が上書きされている場合はそのロールで実行できる', () => {
		const mockMode = {
			id: 'simple-buzzer' as const,
			name: 'mock',
			questionExtraSchema: z.object({}),
			commandSchema: z.discriminatedUnion('type', [z.object({type: z.literal('dummy')})]),
			permissions: {dummy: ['host'] as const},
			reviewPermissions: ['monitor'] as const,
			initialState: () => ({}),
			apply: () => {},
			project: (g: Game) => g,
			describe: () => '',
		};

		const monitorActor: Actor = {role: 'monitor'};
		const hostActor: Actor = {role: 'host'};

		// monitor は実行できる
		const parsed = parseCommand(mockMode, {type: 'review.start'}, monitorActor);
		expect(parsed.kind).toBe('common');
		expect(parsed.command).toEqual({type: 'review.start'});

		// host は権限なしで拒否される
		expect(() => parseCommand(mockMode, {type: 'review.start'}, hostActor)).toThrow('権限');
	});

	it('reviewItems を持たない企画では感想戦を開始できない', () => {
		// 一時的に reviewItems を消したダミー定義で確認
		const original = modes['simple-buzzer'];
		const withoutReview = {...original, reviewItems: undefined};
		modes['simple-buzzer'] = withoutReview;
		try {
			const game = setupGameWithQuestions();
			expect(() => applyCommand(game, {type: 'review.start'}, ctx)).toThrow(
				'この企画では感想戦を行えません',
			);
		} finally {
			modes['simple-buzzer'] = original;
		}
	});

	it('review.* は取り消し (undo) の対象外', () => {
		expect(isUndoableCommandType('review.start')).toBe(false);
		expect(isUndoableCommandType('review.move')).toBe(false);
		expect(isUndoableCommandType('review.end')).toBe(false);
	});
});
