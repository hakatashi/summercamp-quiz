import {beforeEach, describe, expect, it} from 'vitest';
import {applyCommand, createGame, projectGame} from '../../engine.ts';
import type {Actor, Game} from '../../types.ts';
import {BUZZ_GRACE_MS, type SimpleBuzzerState, simpleBuzzer} from './index.ts';

const host: Actor = {role: 'host'};
const system: Actor = {role: 'system'};
const player = (participantId: string): Actor => ({role: 'participant', participantId});

describe('simple-buzzer', () => {
	let game: Game<SimpleBuzzerState>;
	let now: number;

	const run = (
		command: {type: string; [key: string]: unknown},
		actor: Actor = host,
		elapsed = 1000,
	) => {
		now += elapsed;
		game = applyCommand(game, command, {now, actor}) as Game<SimpleBuzzerState>;
		return game;
	};
	/** elapsed ミリ秒後にサーバーに届いた押下。pressedAt を省略すると受信時刻に押したことにする */
	const buzz = (participantId: string, pressedAt?: number, elapsed = 1000) =>
		run({type: 'buzz', pressedAt: pressedAt ?? now + elapsed}, player(participantId), elapsed);
	const state = () => game.state;
	const current = () => state().history.at(-1);
	const statuses = () => current()?.buzzes.map((b) => [b.participantId, b.status]);

	beforeEach(() => {
		now = 1_000_000;
		game = createGame({
			id: 'g',
			mode: 'simple-buzzer',
			title: 'テスト',
			createdAt: now,
		}) as Game<SimpleBuzzerState>;
		run(
			{
				type: 'questions.import',
				replace: true,
				questions: [
					{id: 'q1', text: '問題1', answer: '答え1'},
					{id: 'q2', text: '問題2', answer: '答え2'},
				],
			},
			host,
		);
		for (const [id, name] of [
			['a', 'Alice'],
			['b', 'Bob'],
			['c', 'Carol'],
		] as const) {
			run({type: 'participants.join', participantId: id, name}, system);
		}
	});

	it('参加者は得点 0 から始まる', () => {
		expect(state().scores).toEqual({a: 0, b: 0, c: 0});
		expect(state().phase).toBe('waiting');
	});

	it('出題前はボタンを押せない', () => {
		expect(() => buzz('a')).toThrow('出題中の問題がありません');
	});

	it('正解すると +1 され、問題が終わる', () => {
		run({type: 'next'});
		expect(state().phase).toBe('reading');
		expect(current()?.questionId).toBe('q1');
		buzz('a');
		expect(state().phase).toBe('answering');
		run({type: 'judge', correct: true});
		expect(state().scores.a).toBe(1);
		expect(state().phase).toBe('closed');
		expect(current()?.result).toBe('correct');
	});

	it('誤答すると -1 され、次に押した人に回答権が移る', () => {
		run({type: 'next'});
		buzz('a');
		buzz('b');
		expect(statuses()).toEqual([
			['a', 'answering'],
			['b', 'waiting'],
		]);
		run({type: 'judge', correct: false});
		expect(state().scores.a).toBe(-1);
		expect(state().phase).toBe('answering');
		expect(statuses()).toEqual([
			['a', 'wrong'],
			['b', 'answering'],
		]);
		run({type: 'judge', correct: true});
		expect(state().scores).toEqual({a: -1, b: 1, c: 0});
	});

	it('押した人が全員誤答したら読み上げに戻り、誤答した人はもう押せない', () => {
		run({type: 'next'});
		buzz('a');
		run({type: 'judge', correct: false});
		expect(state().phase).toBe('reading');
		expect(() => buzz('a')).toThrow('既にボタンを押しています');
		buzz('b');
		expect(state().phase).toBe('answering');
	});

	it('参加者全員が誤答したら問題が終わる', () => {
		run({type: 'next'});
		for (const id of ['a', 'b', 'c']) {
			buzz(id);
			run({type: 'judge', correct: false});
		}
		expect(state().phase).toBe('closed');
		expect(current()?.result).toBe('all-wrong');
	});

	it('押下時刻の申告が早い順に並べ替える (猶予の範囲内)', () => {
		run({type: 'next'});
		buzz('a');
		// b は a の 50ms 後に届いたが、100ms 早く押していた
		buzz('b', now - 100, 50);
		expect(statuses()).toEqual([
			['b', 'answering'],
			['a', 'waiting'],
		]);
	});

	it('diag 情報付きの buzz コマンドを受理できる', () => {
		run({type: 'next'});
		run(
			{
				type: 'buzz',
				pressedAt: now + 50,
				diag: {rtt: 25.4, offset: -8.1},
			},
			player('a'),
			50,
		);
		expect(statuses()).toEqual([['a', 'answering']]);
	});

	it('猶予より前の時刻を申告しても、受信時刻から猶予分までしか遡らない', () => {
		run({type: 'next'});
		buzz('a');
		buzz('b', 0);
		const b = current()?.buzzes.find((x) => x.participantId === 'b');
		expect(b?.pressedAt).toBe(now - BUZZ_GRACE_MS);
		expect(statuses()?.[0]).toEqual(['a', 'answering']);
	});

	it('判定済みの押下は並べ替えない', () => {
		run({type: 'next'});
		buzz('a');
		run({type: 'judge', correct: false});
		buzz('b', now + 1000 - BUZZ_GRACE_MS);
		expect(statuses()).toEqual([
			['a', 'wrong'],
			['b', 'answering'],
		]);
	});

	it('スルーすると問題が終わり、待ちの押下は無効になる', () => {
		run({type: 'next'});
		run({type: 'close'});
		expect(current()?.result).toBe('through');
		expect(() => buzz('a')).toThrow();
	});

	it('全問出題したあとに次へ進むと終了する', () => {
		run({type: 'next'});
		run({type: 'close'});
		run({type: 'next'});
		expect(current()?.questionId).toBe('q2');
		run({type: 'close'});
		run({type: 'next'});
		expect(state().phase).toBe('finished');
	});

	it('出題中は次の問題に進めない', () => {
		run({type: 'next'});
		expect(() => run({type: 'next'})).toThrow('終了してから');
	});

	it('出題の取り消しで得点が戻り、未出題に戻せる', () => {
		run({type: 'next'});
		buzz('a');
		run({type: 'judge', correct: false});
		buzz('b');
		run({type: 'judge', correct: true});
		run({type: 'cancel', returnToPool: true});
		expect(state().scores).toEqual({a: 0, b: 0, c: 0});
		expect(state().history).toHaveLength(0);
		expect(state().phase).toBe('waiting');
		run({type: 'next'});
		expect(current()?.questionId).toBe('q1');
	});

	it('取り消した問題をさらに未出題に戻しても、得点は二重に戻らない', () => {
		run({type: 'next'});
		buzz('a');
		run({type: 'judge', correct: true});
		run({type: 'cancel', returnToPool: false});
		expect(state().scores.a).toBe(0);
		expect(() => run({type: 'cancel', returnToPool: false})).toThrow('既に取り消されています');
		run({type: 'cancel', returnToPool: true});
		expect(state().scores.a).toBe(0);
	});

	it('押下のリセットで判定前の押下だけが消える', () => {
		run({type: 'next'});
		buzz('a');
		run({type: 'judge', correct: false});
		buzz('b');
		buzz('c');
		run({type: 'resetBuzzes'});
		expect(statuses()).toEqual([['a', 'wrong']]);
		expect(state().phase).toBe('reading');
		buzz('c');
		expect(state().phase).toBe('answering');
	});

	it('得点を直接変更できる', () => {
		run({type: 'setScore', participantId: 'b', score: 7});
		expect(state().scores.b).toBe(7);
	});

	it('参加者は司会者の操作をできない', () => {
		run({type: 'next'});
		expect(() => run({type: 'judge', correct: true}, player('a'))).toThrow('権限');
		expect(() => run({type: 'questions.delete', id: 'q1'}, player('a'))).toThrow('権限');
	});

	it('出題を記録し、出題前の得点を残す', () => {
		run({type: 'setScore', participantId: 'a', score: 3});
		run({type: 'next'});
		expect(current()?.scoresBefore).toEqual({a: 3, b: 0, c: 0});
	});

	it('参加者とモニターには出題中の問題や未出題の問題を見せない', () => {
		run({type: 'next'});
		expect(projectGame(game, {role: 'monitor'}).questions).toEqual([]);
		expect(projectGame(game, {role: 'host'}).questions).toHaveLength(2);
		run({type: 'close'});
		const visible = projectGame(game, {role: 'participant', participantId: 'a'}).questions;
		expect(visible.map((q) => q.id)).toEqual(['q1']);
	});

	it('askedQuestionIds が出題済みの問題 ID を正しく返す', () => {
		expect(simpleBuzzer.askedQuestionIds?.(game)).toEqual(new Set());
		run({type: 'next'});
		expect(simpleBuzzer.askedQuestionIds?.(game)).toEqual(new Set(['q1']));
		run({type: 'close'});
		run({type: 'next'});
		expect(simpleBuzzer.askedQuestionIds?.(game)).toEqual(new Set(['q1', 'q2']));
		run({type: 'cancel', returnToPool: true});
		expect(simpleBuzzer.askedQuestionIds?.(game)).toEqual(new Set(['q1']));
	});

	it('reviewItems は完了した非取消の出題のみを出題順に返す', () => {
		expect(simpleBuzzer.reviewItems?.(game)).toEqual([]);

		// 1問目: 終了 (正解)
		run({type: 'next'});
		buzz('a');
		run({type: 'judge', correct: true});
		expect(simpleBuzzer.reviewItems?.(game)).toEqual([{questionId: 'q1', recordIndex: 0}]);

		// 2問目: 出題中 (未終了)
		run({type: 'next'});
		expect(simpleBuzzer.reviewItems?.(game)).toEqual([{questionId: 'q1', recordIndex: 0}]);

		// 2問目: 取り消し (プールに戻さない) -> cancelled
		run({type: 'cancel', returnToPool: false});
		expect(simpleBuzzer.reviewItems?.(game)).toEqual([{questionId: 'q1', recordIndex: 0}]);

		// 2問目を取り消してプールに戻す
		run({type: 'cancel', returnToPool: true});
		expect(simpleBuzzer.reviewItems?.(game)).toEqual([{questionId: 'q1', recordIndex: 0}]);

		// 2問目を再度出題して終了 (スルー)
		run({type: 'next'});
		run({type: 'close'});
		expect(simpleBuzzer.reviewItems?.(game)).toEqual([
			{questionId: 'q1', recordIndex: 0},
			{questionId: 'q2', recordIndex: 1},
		]);
	});

	it('感想戦中は参加者とモニターに出題済みの全問題の問題文と答えが見える (noteは消去)', () => {
		run({type: 'next'});
		buzz('a');
		run({type: 'judge', correct: true});

		// 感想戦を開始
		run({type: 'review.start'});

		const monitorGame = projectGame(game, {role: 'monitor'});
		expect(monitorGame.questions.map((q) => q.id)).toEqual(['q1']);
		expect(monitorGame.questions[0]?.text).toBe('問題1');
		expect(monitorGame.questions[0]?.answer).toBe('答え1');
		expect(monitorGame.questions[0]?.note).toBe('');

		const participantGame = projectGame(game, {role: 'participant', participantId: 'a'});
		expect(participantGame.questions.map((q) => q.id)).toEqual(['q1']);
		expect(participantGame.questions[0]?.note).toBe('');
	});

	it('取り消した問題 (cancelled) は感想戦中のモニターと参加者には開示されない', () => {
		run({
			type: 'questions.import',
			replace: true,
			questions: [
				{id: 'q1', text: '問題1', answer: '答え1'},
				{id: 'q2', text: '問題2', answer: '答え2'},
				{id: 'q3', text: '問題3', answer: '答え3'},
			],
		});

		// 1問目: 終了 (正解)
		run({type: 'next'});
		buzz('a');
		run({type: 'judge', correct: true});

		// 2問目: 出題してキャンセル (プールに戻さない)
		run({type: 'next'});
		run({type: 'cancel', returnToPool: false});

		// 3問目: 出題してスルーで終了
		run({type: 'next', questionId: 'q3'});
		run({type: 'close'});

		// 感想戦を開始
		run({type: 'review.start'});

		// reviewItems は q1 と q3 のみ
		expect(simpleBuzzer.reviewItems?.(game)).toEqual([
			{questionId: 'q1', recordIndex: 0},
			{questionId: 'q3', recordIndex: 2},
		]);

		// モニターに見える問題も q1 と q3 のみ (取り消した q2 は見えない)
		const monitorGame = projectGame(game, {role: 'monitor'});
		expect(monitorGame.questions.map((q) => q.id)).toEqual(['q1', 'q3']);

		const participantGame = projectGame(game, {role: 'participant', participantId: 'a'});
		expect(participantGame.questions.map((q) => q.id)).toEqual(['q1', 'q3']);
	});

	it('isBeforeStart は最初の出題の前だけ true になる', () => {
		expect(simpleBuzzer.isBeforeStart?.(game)).toBe(true);
		run({type: 'next'});
		expect(simpleBuzzer.isBeforeStart?.(game)).toBe(false);
		buzz('a');
		run({type: 'judge', correct: true});
		expect(simpleBuzzer.isBeforeStart?.(game)).toBe(false);
	});
});
