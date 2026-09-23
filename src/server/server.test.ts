import {io as connect, type Socket} from 'socket.io-client';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {BuzzerBoardState} from '../shared/modes/buzzer-board/index.ts';
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
	const waitForView = <S = SimpleBuzzerState>(
		socket: ClientSocket,
		predicate: (view: GameView<S>) => boolean,
	) =>
		new Promise<GameView<S>>((resolve) => {
			const listener = (view: GameView) => {
				if (predicate(view as GameView<S>)) {
					socket.off('game', listener);
					resolve(view as GameView<S>);
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

	it('感想戦コマンドが全画面に同期され、undo の対象外である', async () => {
		const {host, gameId} = await setupGame();
		const monitor = await client();
		await call(monitor, 'subscribe', {gameId, role: 'monitor'});
		const alice = await joinAs(gameId, 'Alice');

		// 1問目出題 & 正解
		await call(host, 'command', {type: 'next'});
		await call(alice.socket, 'command', {type: 'buzz', pressedAt: Date.now()});
		await call(host, 'command', {type: 'judge', correct: true});

		// 2問目出題 & スルー
		await call(host, 'command', {type: 'next'});
		await call(host, 'command', {type: 'close'});

		// 直近の undoable 操作はスルー (問題終了)
		expect(app.manager.describeUndoable(gameId)).toBe('スルー (問題終了)');

		// 感想戦を開始
		const hostReview0 = waitForView(host, (v) => v.game.review?.index === 0);
		const monitorReview0 = waitForView(monitor, (v) => v.game.review?.index === 0);
		const aliceReview0 = waitForView(alice.socket, (v) => v.game.review?.index === 0);

		expect(await call(host, 'command', {type: 'review.start'})).toEqual({ok: true});

		const [hostV0, monitorV0, aliceV0] = await Promise.all([
			hostReview0,
			monitorReview0,
			aliceReview0,
		]);
		expect(hostV0.game.review).toEqual({index: 0});
		expect(monitorV0.game.review).toEqual({index: 0});
		expect(aliceV0.game.review).toEqual({index: 0});
		// 感想戦中は参加者にも出題済みの問題が見える
		expect(aliceV0.game.questions.map((q) => q.answer)).toEqual(['答え1', '答え2']);

		// 感想戦コマンドは undoable にならない
		expect(app.manager.describeUndoable(gameId)).toBe('スルー (問題終了)');

		// 次へ移動
		const monitorReview1 = waitForView(monitor, (v) => v.game.review?.index === 1);
		expect(await call(host, 'command', {type: 'review.move', index: 1})).toEqual({ok: true});
		const monitorV1 = await monitorReview1;
		expect(monitorV1.game.review).toEqual({index: 1});

		// 感想戦を終了
		const monitorReviewEnd = waitForView(monitor, (v) => v.game.review === null);
		const aliceReviewEnd = waitForView(alice.socket, (v) => v.game.review === null);
		expect(await call(host, 'command', {type: 'review.end'})).toEqual({ok: true});

		const [monitorVEnd, aliceVEnd] = await Promise.all([monitorReviewEnd, aliceReviewEnd]);
		expect(monitorVEnd.game.review).toBeNull();
		expect(aliceVEnd.game.review).toBeNull();
		// 得点や本戦状態は変わっていない
		expect(aliceVEnd.game.state.scores[alice.participantId]).toBe(1);
	});

	it('buzzer-board: 司会者画面と参加者画面で1ゲームを最後まで進められる', async () => {
		const host = await client();
		const created = await call(host, 'createGame', {
			mode: 'buzzer-board',
			title: '早押しボードテスト',
			password: PASSWORD,
		});
		expect(created.ok).toBe(true);
		const {gameId} = created;
		await call(host, 'subscribe', {gameId, role: 'host', password: PASSWORD});

		const alice = await joinAs(gameId, 'Alice');
		const bob = await joinAs(gameId, 'Bob');

		// 3問インポート (科学1問、スポーツ2問)
		await call(host, 'command', {
			type: 'questions.import',
			replace: true,
			questions: [
				{text: 'スポーツ問1', answer: 'スポーツ答1', extra: {genre: 'スポーツ'}},
				{text: 'スポーツ問2', answer: 'スポーツ答2', extra: {genre: 'スポーツ'}},
				{text: '科学問1', answer: '科学答1', extra: {genre: '科学'}},
			],
		});

		const hostView1 = waitForView<BuzzerBoardState>(host, (v) => v.game.state.phase === 'reading');
		await call(host, 'command', {type: 'next'});
		const v1 = await hostView1;
		expect(v1.game.state.history[0]?.genre).toBe('スポーツ');

		// Alice が押下して正解
		await call(alice.socket, 'command', {type: 'buzz', pressedAt: Date.now()});
		const hostViewAfterQ1 = waitForView<BuzzerBoardState>(
			host,
			(v) => v.game.state.genreChooser === alice.participantId,
		);
		await call(host, 'command', {type: 'judge', correct: true});
		const vAfterQ1 = await hostViewAfterQ1;
		expect(vAfterQ1.game.state.scores[alice.participantId]).toBe(1);

		// Alice が「科学」を選択
		const hostViewGenreChosen = waitForView<BuzzerBoardState>(
			host,
			(v) => v.game.state.nextGenre.genre === '科学',
		);
		await call(alice.socket, 'command', {type: 'chooseGenre', genre: '科学'});
		await hostViewGenreChosen;

		// 2問目出題: 「科学」が出題される
		const hostView2 = waitForView<BuzzerBoardState>(host, (v) => v.game.state.phase === 'reading');
		await call(host, 'command', {type: 'next'});
		const v2 = await hostView2;
		expect(v2.game.state.history[1]?.genre).toBe('科学');

		// Bob が押下して誤答 (連答はリセットされる)
		await call(bob.socket, 'command', {type: 'buzz', pressedAt: Date.now()});
		const hostViewAfterQ2 = waitForView<BuzzerBoardState>(
			host,
			(v) => v.game.state.rest[bob.participantId] === 2,
		);
		await call(host, 'command', {type: 'judge', correct: false});
		await hostViewAfterQ2;

		// 3問目出題: 最後の1問 (スポーツ問2)
		const hostView3 = waitForView<BuzzerBoardState>(host, (v) => v.game.state.phase === 'reading');
		await call(host, 'command', {type: 'next'});
		await hostView3;

		// Bob は休み中なので押せない
		const bobBuzz = await call(bob.socket, 'command', {type: 'buzz', pressedAt: Date.now()});
		expect(bobBuzz.ok).toBe(false);

		// Alice が押下して正解 (直前が誤答なので連答ボーナスなし、+1 で計2点)
		await call(alice.socket, 'command', {type: 'buzz', pressedAt: Date.now()});
		const hostViewAfterQ3 = waitForView<BuzzerBoardState>(
			host,
			(v) => v.game.state.scores[alice.participantId] === 2,
		);
		await call(host, 'command', {type: 'judge', correct: true});
		await hostViewAfterQ3;

		// 次の問題へ -> 全問終了
		const hostViewFinished = waitForView<BuzzerBoardState>(
			host,
			(v) => v.game.state.phase === 'finished',
		);
		await call(host, 'command', {type: 'next'});
		const finishedView = await hostViewFinished;
		expect(finishedView.game.state.phase).toBe('finished');
		expect(finishedView.game.state.scores[alice.participantId]).toBe(2);
	});

	it('buzzer-board: スルーからボードクイズの回答・仮判定・確定と undo の流れが動く', async () => {
		const host = await client();
		const created = await call(host, 'createGame', {
			mode: 'buzzer-board',
			title: '早押しボードクイズ統合テスト',
			password: PASSWORD,
		});
		expect(created.ok).toBe(true);
		const {gameId} = created;
		await call(host, 'subscribe', {gameId, role: 'host', password: PASSWORD});

		const monitor = await client();
		await call(monitor, 'subscribe', {gameId, role: 'monitor'});

		const alice = await joinAs(gameId, 'Alice');

		await call(host, 'command', {
			type: 'questions.import',
			replace: true,
			questions: [{text: '問1', answer: '答1', extra: {genre: '科学'}}],
		});

		// Alice を勝ち抜けに設定
		await call(host, 'command', {
			type: 'setCleared',
			participantId: alice.participantId,
			cleared: true,
		});
		await call(host, 'command', {
			type: 'setScore',
			participantId: alice.participantId,
			score: 5,
		});

		// 1問目出題
		const hostReading = waitForView<BuzzerBoardState>(
			host,
			(v) => v.game.state.phase === 'reading',
		);
		await call(host, 'command', {type: 'next'});
		await hostReading;

		// スルー
		const aliceBoardAnswering = waitForView<BuzzerBoardState>(
			alice.socket,
			(v) => v.game.state.phase === 'board-answering',
		);
		await call(host, 'command', {type: 'through'});
		await aliceBoardAnswering;

		// Alice が回答を送信
		const hostSawAnswer = waitForView<BuzzerBoardState>(
			host,
			(v) =>
				v.game.state.history[0]?.board?.answers[alice.participantId]?.text === 'アインシュタイン',
		);
		const monitorViewBeforeConfirm = waitForView<BuzzerBoardState>(
			monitor,
			(v) => v.game.state.history[0]?.board?.answers[alice.participantId]?.submittedAt !== null,
		);
		await call(alice.socket, 'command', {type: 'boardSubmit', text: 'アインシュタイン'});
		const [hAnsView, mV] = await Promise.all([hostSawAnswer, monitorViewBeforeConfirm]);
		expect(hAnsView.game.state.history[0]?.board?.answers[alice.participantId]?.text).toBe(
			'アインシュタイン',
		);

		// 確定前: モニターには回答本文が届いていない
		expect(mV.game.state.history[0]?.board?.answers[alice.participantId]?.text).toBe('');
		expect(mV.game.state.history[0]?.board?.answers[alice.participantId]?.correct).toBeNull();

		// 締め切り (boardClose)
		const hostJudging = waitForView<BuzzerBoardState>(
			host,
			(v) => v.game.state.phase === 'board-judging',
		);
		await call(host, 'command', {type: 'boardClose'});
		await hostJudging;

		// 仮判定 (boardMark: correct: true)
		const hostMarked = waitForView<BuzzerBoardState>(
			host,
			(v) => v.game.state.history[0]?.board?.answers[alice.participantId]?.correct === true,
		);
		await call(host, 'command', {
			type: 'boardMark',
			participantId: alice.participantId,
			correct: true,
		});
		await hostMarked;

		// 確定 (boardConfirm)
		const hostConfirmed = waitForView<BuzzerBoardState>(
			host,
			(v) => v.game.state.phase === 'closed',
		);
		const monitorConfirmed = waitForView<BuzzerBoardState>(
			monitor,
			(v) => v.game.state.history[0]?.board?.confirmedAt !== null,
		);
		await call(host, 'command', {type: 'boardConfirm'});
		const [hConfirmV, mConfirmV] = await Promise.all([hostConfirmed, monitorConfirmed]);

		// 得点が 5 -> 6 に増加
		expect(hConfirmV.game.state.scores[alice.participantId]).toBe(6);

		// 確定後はモニターにも回答本文と判定が届く
		expect(mConfirmV.game.state.history[0]?.board?.answers[alice.participantId]?.text).toBe(
			'アインシュタイン',
		);
		expect(mConfirmV.game.state.history[0]?.board?.answers[alice.participantId]?.correct).toBe(
			true,
		);

		// 取り消し (undo): 確定を取り消す
		const hostUndo = waitForView<BuzzerBoardState>(
			host,
			(v) => v.game.state.phase === 'board-judging',
		);
		const undone = await call(host, 'undo');
		expect(undone.ok).toBe(true);
		const hUndoneV = await hostUndo;
		// phase が board-judging に戻り、得点も 5 に戻る
		expect(hUndoneV.game.state.phase).toBe('board-judging');
		expect(hUndoneV.game.state.scores[alice.participantId]).toBe(5);
	});
});
