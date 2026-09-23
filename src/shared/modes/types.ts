import type {z} from 'zod';
import type {CommandContext, Game, ModeId, Role, Viewer} from '../types.ts';

export interface ModeCommand {
	type: string;
}

/**
 * 企画ごとのルール定義。サーバーとクライアントの両方から読み込まれるので、
 * Node や DOM に依存しない純粋なコードで書くこと。
 */
export interface ModeDefinition<S = unknown, C extends ModeCommand = ModeCommand> {
	id: ModeId;
	/** 表示名 */
	name: string;
	/** Question.extra の検証 */
	questionExtraSchema: z.ZodType<Record<string, unknown>>;
	/** 企画固有コマンドの検証 */
	commandSchema: z.ZodType<C>;
	/** コマンドの種類ごとに、実行できる role */
	permissions: {[K in C['type']]: readonly Role[]};
	initialState(): S;
	/**
	 * コマンドを適用する。game はコピーなので直接書き換えてよい。
	 * 受け付けられないときは CommandError を投げる。
	 */
	apply(game: Game<S>, command: C, ctx: CommandContext): void;
	/** 参加者が増えた・消えたときの後処理 (省略可) */
	onParticipantJoined?(game: Game<S>, participantId: string, ctx: CommandContext): void;
	onParticipantRemoved?(game: Game<S>, participantId: string, ctx: CommandContext): void;
	/** 閲覧者ごとに見せてよい情報だけを残す。game は書き換えずに新しいオブジェクトを返す */
	project(game: Game<S>, viewer: Viewer): Game<S>;
	/** 取り消し (undo) のときに表示するコマンドの説明 */
	describe(command: C, game: Game<S>): string;
}

/** 型パラメータを消した ModeDefinition (registry で扱うため) */
// biome-ignore lint/suspicious/noExplicitAny: registry では state やコマンドの型を問わない
export type AnyModeDefinition = ModeDefinition<any, any>;
