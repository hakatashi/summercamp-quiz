import {describe, expect, it} from 'vitest';
import {applyCommand, createGame, fillCommandIds} from './engine.ts';
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
