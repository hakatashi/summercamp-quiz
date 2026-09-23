import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import type {MediaMetadata} from '../shared/media.ts';
import type {Actor, Game, ModeId} from '../shared/types.ts';

export interface GameRow {
	id: string;
	mode: ModeId;
	title: string;
	createdAt: number;
	snapshot: Game;
	version: number;
}

export interface EventRow {
	seq: number;
	command: {type: string} & Record<string, unknown>;
	actor: Actor;
	at: number;
	undone: boolean;
}

/** SQLite への読み書き。ゲームごとにイベントログとスナップショットを持つ */
export class Database {
	readonly #db: DatabaseSync;

	constructor(path: string) {
		if (path !== ':memory:') {
			mkdirSync(dirname(path), {recursive: true});
		}
		this.#db = new DatabaseSync(path);
		this.#db.exec(`
			PRAGMA journal_mode = WAL;
			PRAGMA synchronous = NORMAL;
			CREATE TABLE IF NOT EXISTS games (
				id TEXT PRIMARY KEY,
				mode TEXT NOT NULL,
				title TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				snapshot TEXT NOT NULL,
				version INTEGER NOT NULL,
				deleted INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE IF NOT EXISTS events (
				game_id TEXT NOT NULL,
				seq INTEGER NOT NULL,
				command TEXT NOT NULL,
				actor TEXT NOT NULL,
				at INTEGER NOT NULL,
				undone INTEGER NOT NULL DEFAULT 0,
				PRIMARY KEY (game_id, seq)
			);
			CREATE TABLE IF NOT EXISTS participant_tokens (
				token TEXT PRIMARY KEY,
				game_id TEXT NOT NULL,
				participant_id TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS media (
				id TEXT PRIMARY KEY,
				mime_type TEXT NOT NULL,
				size INTEGER NOT NULL,
				original_name TEXT NOT NULL,
				created_at INTEGER NOT NULL
			);
		`);
	}

	close() {
		this.#db.close();
	}

	transaction<T>(fn: () => T): T {
		this.#db.exec('BEGIN');
		try {
			const result = fn();
			this.#db.exec('COMMIT');
			return result;
		} catch (error) {
			this.#db.exec('ROLLBACK');
			throw error;
		}
	}

	listGames(): GameRow[] {
		const rows = this.#db
			.prepare(
				'SELECT id, mode, title, created_at, snapshot, version FROM games WHERE deleted = 0 ORDER BY created_at DESC',
			)
			.all();
		return rows.map((row) => {
			const parsed = JSON.parse(String(row.snapshot)) as Game;
			return {
				id: String(row.id),
				mode: String(row.mode) as ModeId,
				title: String(row.title),
				createdAt: Number(row.created_at),
				snapshot: {
					...parsed,
					review: parsed.review ?? null,
				},
				version: Number(row.version),
			};
		});
	}

	insertGame(game: Game) {
		this.#db
			.prepare(
				'INSERT INTO games (id, mode, title, created_at, snapshot, version) VALUES (?, ?, ?, ?, ?, 0)',
			)
			.run(game.id, game.mode, game.title, game.createdAt, JSON.stringify(game));
	}

	saveSnapshot(game: Game, version: number) {
		this.#db
			.prepare('UPDATE games SET title = ?, snapshot = ?, version = ? WHERE id = ?')
			.run(game.title, JSON.stringify(game), version, game.id);
	}

	markGameDeleted(id: string) {
		this.#db.prepare('UPDATE games SET deleted = 1 WHERE id = ?').run(id);
	}

	appendEvent(gameId: string, event: Omit<EventRow, 'seq' | 'undone'>): number {
		const row = this.#db
			.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE game_id = ?')
			.get(gameId);
		const seq = Number(row?.seq ?? 0) + 1;
		this.#db
			.prepare('INSERT INTO events (game_id, seq, command, actor, at) VALUES (?, ?, ?, ?, ?)')
			.run(gameId, seq, JSON.stringify(event.command), JSON.stringify(event.actor), event.at);
		return seq;
	}

	listEvents(gameId: string): EventRow[] {
		return this.#db
			.prepare('SELECT seq, command, actor, at, undone FROM events WHERE game_id = ? ORDER BY seq')
			.all(gameId)
			.map((row) => ({
				seq: Number(row.seq),
				command: JSON.parse(String(row.command)),
				actor: JSON.parse(String(row.actor)),
				at: Number(row.at),
				undone: Number(row.undone) === 1,
			}));
	}

	markEventUndone(gameId: string, seq: number) {
		this.#db.prepare('UPDATE events SET undone = 1 WHERE game_id = ? AND seq = ?').run(gameId, seq);
	}

	insertToken(token: string, gameId: string, participantId: string) {
		this.#db
			.prepare('INSERT INTO participant_tokens (token, game_id, participant_id) VALUES (?, ?, ?)')
			.run(token, gameId, participantId);
	}

	findToken(token: string): {gameId: string; participantId: string} | null {
		const row = this.#db
			.prepare('SELECT game_id, participant_id FROM participant_tokens WHERE token = ?')
			.get(token);
		return row ? {gameId: String(row.game_id), participantId: String(row.participant_id)} : null;
	}

	insertMedia(media: MediaMetadata) {
		this.#db
			.prepare(
				'INSERT INTO media (id, mime_type, size, original_name, created_at) VALUES (?, ?, ?, ?, ?)',
			)
			.run(media.id, media.mimeType, media.size, media.originalName, media.createdAt);
	}

	findMedia(id: string): MediaMetadata | null {
		const row = this.#db
			.prepare('SELECT id, mime_type, size, original_name, created_at FROM media WHERE id = ?')
			.get(id);
		return row
			? {
					id: String(row.id),
					mimeType: String(row.mime_type),
					size: Number(row.size),
					originalName: String(row.original_name),
					createdAt: Number(row.created_at),
				}
			: null;
	}
}
