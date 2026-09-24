import {describe, expect, it} from 'vitest';
import {applyCommand, createGame, parseCommand, projectGame} from '../../engine.ts';
import type {Actor, CommandContext, Game} from '../../types.ts';
import {getMode} from '../registry.ts';
import type {ListeningMathState} from './index.ts';

type G = Game<ListeningMathState>;

const host: Actor = {role: 'host'};
const monitor: Actor = {role: 'monitor'};
const ctx = (now = 0, actor: Actor = monitor): CommandContext => ({now, actor});

const base = (): G => createGame({id: 'g', mode: 'listening-math', title: 't', createdAt: 0}) as G;

const withQuestions = (count = 3): G =>
	applyCommand(
		base(),
		{
			type: 'questions.import',
			replace: false,
			questions: Array.from({length: count}, (_, i) => ({
				id: `q${i + 1}`,
				text: `問題${i + 1}`,
				answer: `${i + 1}`,
				note: 'メモ',
				extra: {audio: `audio${i + 1}`, explanation: `$x = ${i + 1}$`, source: 'オリジナル'},
			})),
		},
		ctx(0, host),
	) as G;

const run = (game: G, command: {type: string} & Record<string, unknown>, now = 0) =>
	applyCommand(game, command, ctx(now)) as G;

describe('listening-math', () => {
	it('解説と出典は省略でき、空文字になる', () => {
		const game = applyCommand(
			base(),
			{type: 'questions.add', question: {id: 'a', text: 'Q', answer: 'A', extra: {audio: 'x'}}},
			ctx(0, host),
		);
		expect(game.questions[0]?.extra).toEqual({audio: 'x', explanation: '', source: ''});
	});

	it('先頭から出題し、進捗を報告し、最後まで再生したら終了する', () => {
		let game = run(withQuestions(), {type: 'play'}, 100);
		expect(game.state).toMatchObject({phase: 'playing', currentIndex: 0, startedAt: 100});
		game = run(game, {type: 'progress', index: 2});
		expect(game.state.currentIndex).toBe(2);
		game = run(game, {type: 'finish'});
		expect(game.state.phase).toBe('played');
		expect(() => run(game, {type: 'progress', index: 1})).toThrow('出題中ではありません');
	});

	it('指定した番号から出題できる', () => {
		const game = run(withQuestions(), {type: 'play', index: 1});
		expect(game.state.currentIndex).toBe(1);
		expect(() => run(withQuestions(), {type: 'play', index: 3})).toThrow(
			'その番号の問題はありません',
		);
	});

	it('停止すると idle に戻り、再生していた問題の番号を残す', () => {
		let game = run(withQuestions(), {type: 'play'});
		game = run(game, {type: 'progress', index: 1});
		game = run(game, {type: 'stop'});
		expect(game.state).toMatchObject({phase: 'idle', currentIndex: 1});
		expect(() => run(game, {type: 'stop'})).toThrow('出題中ではありません');
	});

	it('問題がないときや音声のない問題があるときは出題できない', () => {
		expect(() => run(base(), {type: 'play'})).toThrow('問題がありません');
		const game = applyCommand(
			withQuestions(2),
			{type: 'questions.add', question: {id: 'x', text: 'Q', answer: 'A'}},
			ctx(0, host),
		) as G;
		expect(() => run(game, {type: 'play'})).toThrow('第 3 問');
	});

	it('範囲外の進捗は拒否する', () => {
		const game = run(withQuestions(), {type: 'play'});
		expect(() => run(game, {type: 'progress', index: 3})).toThrow('その番号の問題はありません');
	});

	it('問題の間隔を変えられる', () => {
		const game = run(withQuestions(), {type: 'setInterval', seconds: 2.5});
		expect(game.state.intervalSeconds).toBe(2.5);
		expect(() => run(game, {type: 'setInterval', seconds: -1})).toThrow('不正なコマンド');
		expect(() => run(game, {type: 'setInterval', seconds: 61})).toThrow('不正なコマンド');
	});

	it('振り返りでは全問を順にたどり、振り返り中は出題できない', () => {
		let game = run(withQuestions(), {type: 'review.start'});
		expect(game.review).toEqual({index: 0});
		expect(getMode('listening-math').reviewItems?.(game)).toEqual([
			{questionId: 'q1', recordIndex: 0},
			{questionId: 'q2', recordIndex: 1},
			{questionId: 'q3', recordIndex: 2},
		]);
		game = run(game, {type: 'review.move', index: 5});
		expect(game.review).toEqual({index: 2});
		expect(() => run(game, {type: 'play'})).toThrow('振り返りを終えてから');
		game = run(game, {type: 'review.end'});
		expect(game.review).toBeNull();
	});

	describe('投影', () => {
		it('振り返り以外では、モニターに問題文・正解・解説・出典・メモを送らない', () => {
			for (const game of [withQuestions(), run(withQuestions(), {type: 'play'})]) {
				const projected = projectGame(game, {role: 'monitor'});
				expect(projected.questions.map((q) => [q.text, q.answer, q.note, q.extra])).toEqual([
					['', '', '', {audio: 'audio1'}],
					['', '', '', {audio: 'audio2'}],
					['', '', '', {audio: 'audio3'}],
				]);
			}
		});

		it('振り返り中は、モニターにもメモ以外を送る', () => {
			const game = run(withQuestions(), {type: 'review.start'});
			const projected = projectGame(game, {role: 'monitor'});
			expect(projected.questions[0]).toEqual({
				id: 'q1',
				text: '問題1',
				answer: '1',
				note: '',
				extra: {audio: 'audio1', explanation: '$x = 1$', source: 'オリジナル'},
			});
		});

		it('司会者 (問題編集) には全て送る', () => {
			const game = run(withQuestions(), {type: 'play'});
			expect(projectGame(game, {role: 'host'})).toBe(game);
		});
	});

	describe('権限', () => {
		const mode = getMode('listening-math');
		const participant: Actor = {role: 'participant', participantId: 'p'};

		it('モニターと司会者は企画のコマンドと振り返りのコマンドを実行できる', () => {
			for (const actor of [monitor, host]) {
				for (const command of [
					{type: 'play'},
					{type: 'progress', index: 0},
					{type: 'stop'},
					{type: 'finish'},
					{type: 'setInterval', seconds: 1},
					{type: 'review.start'},
					{type: 'review.move', index: 1},
					{type: 'review.end'},
				]) {
					expect(parseCommand(mode, command, actor).command.type).toBe(command.type);
				}
			}
		});

		it('参加者は実行できない', () => {
			expect(() => parseCommand(mode, {type: 'play'}, participant)).toThrow('権限がありません');
			expect(() => parseCommand(mode, {type: 'review.start'}, participant)).toThrow(
				'権限がありません',
			);
		});

		it('モニターは問題の編集やゲーム名の変更はできない', () => {
			expect(() => parseCommand(mode, {type: 'questions.delete', id: 'q1'}, monitor)).toThrow(
				'権限がありません',
			);
			expect(() => parseCommand(mode, {type: 'game.rename', title: 'x'}, monitor)).toThrow(
				'権限がありません',
			);
		});

		it('モニターの購読に司会者パスワードを求める', () => {
			expect(mode.monitorRequiresHost).toBe(true);
		});

		it('ほかの企画のモニターは閲覧専用のまま', () => {
			for (const id of ['simple-buzzer', 'buzzer-board', 'palindrome'] as const) {
				const other = getMode(id);
				expect(other.monitorRequiresHost ?? false).toBe(false);
				for (const [type, roles] of Object.entries(other.permissions)) {
					expect(roles, `${id}.${type}`).not.toContain('monitor');
				}
				expect(() => parseCommand(other, {type: 'review.start'}, monitor)).toThrow(
					'権限がありません',
				);
			}
		});
	});
});
