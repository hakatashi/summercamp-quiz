import {randomBytes, randomUUID} from 'node:crypto';
import {isUndoableCommandType} from '../shared/commands.ts';
import {
	applyCommand,
	createGame,
	describeCommand,
	fillCommandIds,
	parseCommand,
} from '../shared/engine.ts';
import {getMode} from '../shared/modes/registry.ts';
import {
	type Actor,
	CommandError,
	type Game,
	type GameSummary,
	type ModeId,
} from '../shared/types.ts';
import type {Database, EventRow} from './db.ts';

interface Entry {
	game: Game;
	version: number;
}

type RawCommand = {type: string} & Record<string, unknown>;

export type ChangeListener = (gameId: string) => void;

/**
 * ゲームの状態をメモリに持ち、コマンドの適用、永続化、変更通知を行う。
 * 状態を変更するのはこのクラスだけ。
 */
export class GameManager {
	readonly #db: Database;
	readonly #games = new Map<string, Entry>();
	readonly #listeners = new Set<ChangeListener>();
	readonly #now: () => number;

	constructor(db: Database, options: {now?: () => number} = {}) {
		this.#db = db;
		this.#now = options.now ?? Date.now;
		for (const row of db.listGames()) {
			this.#games.set(row.id, {game: row.snapshot, version: row.version});
		}
	}

	onChange(listener: ChangeListener) {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	#notify(gameId: string) {
		for (const listener of this.#listeners) {
			listener(gameId);
		}
	}

	list(): GameSummary[] {
		return [...this.#games.values()]
			.map(({game}) => ({
				id: game.id,
				mode: game.mode,
				title: game.title,
				createdAt: game.createdAt,
				participantCount: game.participants.length,
				questionCount: game.questions.length,
			}))
			.sort((a, b) => b.createdAt - a.createdAt);
	}

	get(gameId: string): Entry | undefined {
		return this.#games.get(gameId);
	}

	#require(gameId: string): Entry {
		const entry = this.#games.get(gameId);
		if (!entry) {
			throw new CommandError('ゲームが見つかりません');
		}
		return entry;
	}

	create(mode: ModeId, title: string): Game {
		const game = createGame({id: shortId(), mode, title, createdAt: this.#now()});
		this.#db.insertGame(game);
		this.#games.set(game.id, {game, version: 0});
		return game;
	}

	delete(gameId: string) {
		this.#require(gameId);
		this.#db.markGameDeleted(gameId);
		this.#games.delete(gameId);
	}

	/** コマンドを適用して保存し、変更を通知する */
	execute(gameId: string, raw: unknown, actor: Actor): Entry {
		const entry = this.#require(gameId);
		const now = this.#now();
		const mode = getMode(entry.game.mode);
		// ID を埋めてから適用・保存することで、再生しても同じ結果になる
		const {command} = parseCommand(mode, raw, actor);
		const filled = fillCommandIds(command, randomUUID) as RawCommand;
		const game = applyCommand(entry.game, filled, {now, actor});
		const next = {game, version: entry.version + 1};
		this.#db.transaction(() => {
			this.#db.appendEvent(gameId, {command: filled, actor, at: now});
			this.#db.saveSnapshot(game, next.version);
		});
		this.#games.set(gameId, next);
		this.#notify(gameId);
		return next;
	}

	/** 参加登録してトークンを発行する */
	join(gameId: string, name: string): {token: string; participantId: string} {
		const participantId = randomUUID();
		this.execute(gameId, {type: 'participants.join', participantId, name}, {role: 'system'});
		const token = randomBytes(24).toString('base64url');
		this.#db.insertToken(token, gameId, participantId);
		return {token, participantId};
	}

	/** トークンから参加者を探す。削除された参加者なら null */
	resolveToken(gameId: string, token: string): string | null {
		const found = this.#db.findToken(token);
		if (!found || found.gameId !== gameId) {
			return null;
		}
		const entry = this.#games.get(gameId);
		return entry?.game.participants.some((p) => p.id === found.participantId)
			? found.participantId
			: null;
	}

	#lastUndoableEvent(gameId: string): EventRow | undefined {
		return this.#db
			.listEvents(gameId)
			.findLast((e) => !e.undone && isUndoableCommandType(e.command.type));
	}

	/** 取り消せる直近の操作の説明 */
	describeUndoable(gameId: string): string | null {
		const entry = this.#games.get(gameId);
		const event = this.#lastUndoableEvent(gameId);
		if (!entry || !event) {
			return null;
		}
		const description = describeCommand(entry.game, event.command);
		if (event.actor.role === 'participant') {
			const {participantId} = event.actor;
			const name = entry.game.participants.find((p) => p.id === participantId)?.name ?? '?';
			return `${description} (${name})`;
		}
		return description;
	}

	/**
	 * 直近の操作 (問題の編集と参加登録を除く) を取り消す。
	 * 取り消した操作を除いたイベントログを最初から再生して状態を作り直す。
	 */
	undo(gameId: string): string {
		const entry = this.#require(gameId);
		const target = this.#lastUndoableEvent(gameId);
		if (!target) {
			throw new CommandError('取り消せる操作がありません');
		}
		const description = this.describeUndoable(gameId) ?? target.command.type;
		const {game: current} = entry;
		let game: Game = createGame({
			id: current.id,
			mode: current.mode,
			title: current.title,
			createdAt: current.createdAt,
		});
		const skipped: number[] = [target.seq];
		for (const event of this.#db.listEvents(gameId)) {
			if (event.undone || event.seq === target.seq) {
				continue;
			}
			try {
				game = applyCommand(game, event.command, {now: event.at, actor: event.actor});
			} catch (error) {
				if (!(error instanceof CommandError)) {
					throw error;
				}
				// 取り消した操作に依存していて、もう成り立たない操作
				skipped.push(event.seq);
			}
		}
		const next = {game, version: entry.version + 1};
		this.#db.transaction(() => {
			for (const seq of skipped) {
				this.#db.markEventUndone(gameId, seq);
			}
			this.#db.saveSnapshot(game, next.version);
		});
		this.#games.set(gameId, next);
		this.#notify(gameId);
		return description;
	}
}

/** URL に入れやすい短い ID */
const shortId = () => randomBytes(6).toString('base64url');
