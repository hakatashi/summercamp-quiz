import type {Server as HttpServer} from 'node:http';
import {Server, type Socket} from 'socket.io';
import {z} from 'zod';
import {projectGame} from '../shared/engine.ts';
import {isModeId} from '../shared/modes/registry.ts';
import type {Ack, ClientToServerEvents, ServerToClientEvents} from '../shared/protocol.ts';
import {type Actor, CommandError, type GameView, type Viewer} from '../shared/types.ts';
import {isHostPasswordValid} from './auth.ts';
import type {GameManager} from './gameManager.ts';

interface SocketData {
	gameId: string | null;
	viewer: Viewer | null;
}

type AppServer = Server<
	ClientToServerEvents,
	ServerToClientEvents,
	Record<string, never>,
	SocketData
>;
type AppSocket = Socket<
	ClientToServerEvents,
	ServerToClientEvents,
	Record<string, never>,
	SocketData
>;

const rooms = {
	host: (gameId: string) => `game:${gameId}:host`,
	monitor: (gameId: string) => `game:${gameId}:monitor`,
	participant: (gameId: string, participantId: string) =>
		`game:${gameId}:participant:${participantId}`,
	all: (gameId: string) => `game:${gameId}`,
};

const subscribeSchema = z.object({
	gameId: z.string(),
	role: z.enum(['host', 'participant', 'monitor']),
	token: z.string().optional(),
	password: z.string().optional(),
});

export interface SocketOptions {
	/** 司会者パスワード。空なら誰でも司会者になれる */
	hostPassword: string;
}

export const attachSocketServer = (
	httpServer: HttpServer,
	manager: GameManager,
	options: SocketOptions,
): AppServer => {
	const io: AppServer = new Server(httpServer, {
		// スマホがスリープから戻ったときなどに素早く再接続できるよう、短めにする
		pingInterval: 10_000,
		pingTimeout: 8_000,
	});

	const isHost = (password: string | undefined) =>
		isHostPasswordValid(options.hostPassword, password);

	/** gameId → participantId → 接続数 */
	const online = new Map<string, Map<string, number>>();
	const onlineList = (gameId: string) => [...(online.get(gameId)?.keys() ?? [])];
	const setOnline = (gameId: string, participantId: string, delta: number) => {
		const counts = online.get(gameId) ?? new Map<string, number>();
		const count = (counts.get(participantId) ?? 0) + delta;
		if (count > 0) {
			counts.set(participantId, count);
		} else {
			counts.delete(participantId);
		}
		online.set(gameId, counts);
		broadcast(gameId);
	};

	const buildView = (gameId: string, viewer: Viewer): GameView | null => {
		const entry = manager.get(gameId);
		if (!entry) {
			return null;
		}
		return {
			game: projectGame(entry.game, viewer),
			version: entry.version,
			online: onlineList(gameId),
			questionCount: entry.game.questions.length,
			undoable: viewer.role === 'host' ? manager.describeUndoable(gameId) : null,
		};
	};

	const broadcast = (gameId: string) => {
		const entry = manager.get(gameId);
		if (!entry) {
			return;
		}
		for (const viewer of [{role: 'host'}, {role: 'monitor'}] as const) {
			const view = buildView(gameId, viewer);
			if (view) {
				io.to(rooms[viewer.role](gameId)).emit('game', view);
			}
		}
		for (const participant of entry.game.participants) {
			const view = buildView(gameId, {role: 'participant', participantId: participant.id});
			if (view) {
				io.to(rooms.participant(gameId, participant.id)).emit('game', view);
			}
		}
	};

	/** 削除された参加者の接続を購読から外す */
	const kickRemovedParticipants = (gameId: string) => {
		const entry = manager.get(gameId);
		for (const socket of io.sockets.sockets.values()) {
			const {viewer} = socket.data;
			if (socket.data.gameId !== gameId || viewer?.role !== 'participant') continue;
			const {participantId} = viewer;
			if (!entry?.game.participants.some((p) => p.id === participantId)) {
				unsubscribe(socket);
				socket.emit('kicked', '参加者から削除されました');
			}
		}
	};

	manager.onChange((gameId) => {
		broadcast(gameId);
		kickRemovedParticipants(gameId);
		io.emit('gamesChanged');
	});

	const fail = (ack: Ack<never> | Ack, error: unknown) => {
		if (error instanceof CommandError) {
			ack({ok: false, error: error.message});
			return;
		}
		console.error(error);
		ack({ok: false, error: 'サーバーでエラーが発生しました'});
	};

	/** 購読を解除する (オンライン状態の後始末を含む) */
	const unsubscribe = (socket: AppSocket) => {
		const {gameId, viewer} = socket.data;
		if (!gameId || !viewer) {
			return;
		}
		for (const room of socket.rooms) {
			if (room !== socket.id) {
				socket.leave(room);
			}
		}
		socket.data.gameId = null;
		socket.data.viewer = null;
		if (viewer.role === 'participant') {
			setOnline(gameId, viewer.participantId, -1);
		}
	};

	io.on('connection', (socket) => {
		socket.data.gameId = null;
		socket.data.viewer = null;

		socket.on('time', (ack) => {
			if (typeof ack === 'function') ack(Date.now());
		});

		socket.on('checkPassword', (password, ack) => {
			ack({ok: true, required: options.hostPassword !== '' && !isHost(password)});
		});

		socket.on('listGames', (ack) => {
			ack({ok: true, games: manager.list()});
		});

		socket.on('createGame', (request, ack) => {
			try {
				if (!isHost(request?.password)) {
					throw new CommandError('司会者パスワードが違います');
				}
				const title = z.string().trim().min(1).max(100).safeParse(request?.title);
				if (!isModeId(String(request?.mode)) || !title.success) {
					throw new CommandError('企画の種類かタイトルが不正です');
				}
				const game = manager.create(request.mode, title.data);
				io.emit('gamesChanged');
				ack({ok: true, gameId: game.id});
			} catch (error) {
				fail(ack, error);
			}
		});

		socket.on('deleteGame', (request, ack) => {
			try {
				if (!isHost(request?.password)) {
					throw new CommandError('司会者パスワードが違います');
				}
				const gameId = String(request?.gameId);
				manager.delete(gameId);
				for (const other of io.sockets.sockets.values()) {
					if (other.data.gameId === gameId) {
						unsubscribe(other);
						other.emit('kicked', 'ゲームが削除されました');
					}
				}
				io.emit('gamesChanged');
				ack({ok: true});
			} catch (error) {
				fail(ack, error);
			}
		});

		socket.on('join', (request, ack) => {
			try {
				const gameId = String(request?.gameId);
				if (!manager.get(gameId)) {
					throw new CommandError('ゲームが見つかりません');
				}
				ack({ok: true, ...manager.join(gameId, String(request?.name ?? '').trim())});
			} catch (error) {
				fail(ack, error);
			}
		});

		socket.on('subscribe', (raw, ack) => {
			try {
				const request = subscribeSchema.safeParse(raw);
				if (!request.success) {
					throw new CommandError('不正なリクエストです');
				}
				const {gameId, role, token, password} = request.data;
				if (!manager.get(gameId)) {
					throw new CommandError('ゲームが見つかりません');
				}
				let viewer: Viewer;
				if (role === 'host') {
					if (!isHost(password)) {
						throw new CommandError('司会者パスワードが違います');
					}
					viewer = {role: 'host'};
				} else if (role === 'participant') {
					const participantId = token ? manager.resolveToken(gameId, token) : null;
					if (!participantId) {
						throw new CommandError('参加登録が必要です');
					}
					viewer = {role: 'participant', participantId};
				} else {
					viewer = {role: 'monitor'};
				}

				unsubscribe(socket);
				socket.data.gameId = gameId;
				socket.data.viewer = viewer;
				socket.join(rooms.all(gameId));
				socket.join(
					viewer.role === 'participant'
						? rooms.participant(gameId, viewer.participantId)
						: rooms[viewer.role](gameId),
				);
				ack({ok: true, participantId: viewer.role === 'participant' ? viewer.participantId : null});
				if (viewer.role === 'participant') {
					// broadcast も兼ねる
					setOnline(gameId, viewer.participantId, 1);
				} else {
					const view = buildView(gameId, viewer);
					if (view) socket.emit('game', view);
				}
			} catch (error) {
				fail(ack, error);
			}
		});

		socket.on('command', (command, ack) => {
			try {
				const {gameId, viewer} = socket.data;
				if (!gameId || !viewer) {
					throw new CommandError('ゲームを購読していません');
				}
				if (viewer.role === 'monitor') {
					throw new CommandError('モニターからは操作できません');
				}
				const actor: Actor = viewer;
				manager.execute(gameId, command, actor);
				ack({ok: true});
			} catch (error) {
				fail(ack, error);
			}
		});

		socket.on('undo', (ack) => {
			try {
				const {gameId, viewer} = socket.data;
				if (!gameId || viewer?.role !== 'host') {
					throw new CommandError('司会者だけが取り消しできます');
				}
				ack({ok: true, undone: manager.undo(gameId)});
			} catch (error) {
				fail(ack, error);
			}
		});

		socket.on('disconnect', () => {
			unsubscribe(socket);
		});
	});

	return io;
};
