import {io as connect, type Socket} from 'socket.io-client';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {SimpleBuzzerState} from '../shared/modes/simple-buzzer/index.ts';
import type {ClientToServerEvents, ServerToClientEvents} from '../shared/protocol.ts';
import type {GameView} from '../shared/types.ts';
import {createApp} from './app.ts';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const PASSWORD = 'secret';

/** ack 付きのイベントを Promise で呼ぶ */
// biome-ignore lint/suspicious/noExplicitAny: テスト用の薄いヘルパー
const call = <T = any>(socket: ClientSocket, event: string, ...args: unknown[]): Promise<T> =>
	// biome-ignore lint/suspicious/noExplicitAny: socket.io の型を迂回する
	new Promise((resolve) => (socket as any).emit(event, ...args, resolve));

describe('サーバー', () => {
	let app: ReturnType<typeof createApp>;
	let url: string;
	const sockets: ClientSocket[] = [];

	const client = async () => {
		const socket: ClientSocket = connect(url, {transports: ['websocket'], forceNew: true});
		sockets.push(socket);
		await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
		return socket;
	};

	/** 条件を満たす game イベントを待つ */
	const waitForView = (
		socket: ClientSocket,
		predicate: (view: GameView<SimpleBuzzerState>) => boolean,
	) =>
		new Promise<GameView<SimpleBuzzerState>>((resolve) => {
			const listener = (view: GameView) => {
				if (predicate(view as GameView<SimpleBuzzerState>)) {
					socket.off('game', listener);
					resolve(view as GameView<SimpleBuzzerState>);
				}
			};
			socket.on('game', listener);
		});

	beforeEach(async () => {
		app = createApp({dbPath: ':memory:', hostPassword: PASSWORD});
		const port = await app.listen(0, '127.0.0.1');
		url = `http://127.0.0.1:${port}`;
	});

	afterEach(async () => {
		for (const socket of sockets.splice(0)) socket.disconnect();
		await app.close();
	});

	const setupGame = async () => {
		const host = await client();
		const created = await call(host, 'createGame', {
			mode: 'simple-buzzer',
			title: 'テスト',
			password: PASSWORD,
		});
		expect(created.ok).toBe(true);
		const {gameId} = created;
		expect(await call(host, 'subscribe', {gameId, role: 'host', password: PASSWORD})).toMatchObject(
			{ok: true},
		);
		await call(host, 'command', {
			type: 'questions.import',
			replace: true,
			questions: [
				{text: '問題1', answer: '答え1'},
				{text: '問題2', answer: '答え2'},
			],
		});
		return {host, gameId: gameId as string};
	};

	const joinAs = async (gameId: string, name: string) => {
		const socket = await client();
		const joined = await call(socket, 'join', {gameId, name});
		expect(joined.ok).toBe(true);
		const subscribed = await call(socket, 'subscribe', {
			gameId,
			role: 'participant',
			token: joined.token,
		});
		expect(subscribed).toMatchObject({ok: true, participantId: joined.participantId});
		return {socket, participantId: joined.participantId as string, token: joined.token as string};
	};

	it('パスワードが違うと司会者として購読できない', async () => {
		const {gameId} = await setupGame();
		const other = await client();
		expect(await call(other, 'subscribe', {gameId, role: 'host', password: 'x'})).toEqual({
			ok: false,
			error: '司会者パスワードが違います',
		});
		expect(
			await call(other, 'createGame', {mode: 'simple-buzzer', title: 'x', password: 'x'}),
		).toMatchObject({ok: false});
	});

	it('押した順に回答権が与えられ、全員の画面に同期される', async () => {
		const {host, gameId} = await setupGame();
		const monitor = await client();
		await call(monitor, 'subscribe', {gameId, role: 'monitor'});
		const alice = await joinAs(gameId, 'Alice');
		const bob = await joinAs(gameId, 'Bob');

		expect(await call(host, 'command', {type: 'next'})).toEqual({ok: true});
		const monitorAnswering = waitForView(monitor, (v) => v.game.state.phase === 'answering');
		expect(await call(bob.socket, 'command', {type: 'buzz', pressedAt: Date.now()})).toEqual({
			ok: true,
		});
		expect(await call(alice.socket, 'command', {type: 'buzz', pressedAt: Date.now()})).toEqual({
			ok: true,
		});
		const view = await monitorAnswering;
		expect(view.game.state.history.at(-1)?.buzzes[0]?.participantId).toBe(bob.participantId);
		// 出題中の問題文はモニターに送らない
		expect(view.game.questions).toEqual([]);

		const aliceCorrect = waitForView(
			alice.socket,
			(v) => v.game.state.scores[alice.participantId] === 1,
		);
		await call(host, 'command', {type: 'judge', correct: false});
		await call(host, 'command', {type: 'judge', correct: true});
		const aliceView = await aliceCorrect;
		expect(aliceView.game.state.scores[bob.participantId]).toBe(-1);
		expect(aliceView.game.state.phase).toBe('closed');
		expect(aliceView.game.questions.map((q) => q.answer)).toEqual(['答え1']);
	});

	it('参加者は司会者のコマンドを送れない', async () => {
		const {gameId} = await setupGame();
		const alice = await joinAs(gameId, 'Alice');
		expect(await call(alice.socket, 'command', {type: 'next'})).toEqual({
			ok: false,
			error: 'この操作をする権限がありません',
		});
		expect(await call(alice.socket, 'undo')).toMatchObject({ok: false});
	});

	it('トークンで再接続すると同じ参加者に戻る', async () => {
		const {gameId} = await setupGame();
		const alice = await joinAs(gameId, 'Alice');
		alice.socket.disconnect();
		const again = await client();
		expect(
			await call(again, 'subscribe', {gameId, role: 'participant', token: alice.token}),
		).toEqual({ok: true, participantId: alice.participantId});
		expect(
			await call(again, 'subscribe', {gameId, role: 'participant', token: 'invalid'}),
		).toMatchObject({ok: false});
	});

	it('接続中の参加者が司会者に通知される', async () => {
		const {host, gameId} = await setupGame();
		const online = waitForView(host, (v) => v.online.length === 1);
		const alice = await joinAs(gameId, 'Alice');
		expect((await online).online).toEqual([alice.participantId]);
		const offline = waitForView(host, (v) => v.online.length === 0);
		alice.socket.disconnect();
		await offline;
	});

	it('直近の操作を取り消せる', async () => {
		const {host, gameId} = await setupGame();
		const alice = await joinAs(gameId, 'Alice');
		await call(host, 'command', {type: 'next'});
		await call(alice.socket, 'command', {type: 'buzz', pressedAt: Date.now()});
		await call(host, 'command', {type: 'judge', correct: false});
		expect(app.manager.describeUndoable(gameId)).toBe('誤答判定');

		const restored = waitForView(host, (v) => v.game.state.phase === 'answering');
		expect(await call(host, 'undo')).toEqual({ok: true, undone: '誤答判定'});
		const view = await restored;
		expect(view.game.state.scores[alice.participantId]).toBe(0);
		expect(view.undoable).toBe('ボタン押下 (Alice)');
		// 問題の編集は取り消しの対象外
		await call(host, 'undo');
		await call(host, 'undo');
		expect(app.manager.get(gameId)?.game.questions).toHaveLength(2);
		expect(await call(host, 'undo')).toMatchObject({ok: false});
	});

	it('削除した参加者は購読から外れる', async () => {
		const {host, gameId} = await setupGame();
		const alice = await joinAs(gameId, 'Alice');
		const kicked = new Promise<string>((resolve) => alice.socket.once('kicked', resolve));
		await call(host, 'command', {type: 'participants.remove', participantId: alice.participantId});
		expect(await kicked).toBe('参加者から削除されました');
		expect(
			await call(alice.socket, 'command', {type: 'buzz', pressedAt: Date.now()}),
		).toMatchObject({ok: false});
	});
});
