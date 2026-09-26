import type {z} from 'zod';
import type {CommandContext, Game, ModeId, ReviewItem, Role, Viewer} from '../types.ts';

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
	/** 感想戦コマンドを実行できる role (省略時は ['host']) */
	reviewPermissions?: readonly Role[];
	/**
	 * true ならモニターの購読にも司会者パスワードを要求し、permissions に 'monitor' を含むコマンドを
	 * モニターから実行できるようにする。false (省略時) のモニターは閲覧専用で、コマンドを一切送れない
	 */
	monitorRequiresHost?: boolean;
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
	/** 出題済みの問題 ID の集合を返す (省略可) */
	askedQuestionIds?(game: Game<S>): Set<string>;
	/** まだ本戦が始まっていない (待機中) かどうか。true の間はモニターに参加用 QR コードを出す (省略時は false 扱い) */
	isBeforeStart?(game: Game<S>): boolean;
	/** 感想戦で振り返る項目の配列を返す (定義されていない企画では感想戦を開始できない) */
	reviewItems?(game: Game<S>): ReviewItem[];
}

/** 型パラメータを消した ModeDefinition (registry で扱うため) */
// biome-ignore lint/suspicious/noExplicitAny: registry では state やコマンドの型を問わない
export type AnyModeDefinition = ModeDefinition<any, any>;
