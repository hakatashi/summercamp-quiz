import type {GameSummary, GameView, ModeId, Role} from './types.ts';

export type Ack<T = object> = (response: ({ok: true} & T) | {ok: false; error: string}) => void;

export interface SubscribeRequest {
	gameId: string;
	role: Role;
	/** 参加者トークン (role が participant のとき) */
	token?: string | undefined;
	/** 司会者パスワード (role が host のとき、または monitorRequiresHost の企画で role が monitor のとき) */
	password?: string | undefined;
}

export interface ClientToServerEvents {
	/** サーバー時刻を返す (時刻同期用) */
	time: (ack: (serverNow: number) => void) => void;
	/** 司会者パスワードが必要かどうかと、パスワードが正しいかを確認する */
	checkPassword: (password: string, ack: Ack<{required: boolean}>) => void;
	listGames: (ack: Ack<{games: GameSummary[]}>) => void;
	createGame: (
		request: {mode: ModeId; title: string; password?: string | undefined},
		ack: Ack<{gameId: string}>,
	) => void;
	deleteGame: (request: {gameId: string; password?: string | undefined}, ack: Ack) => void;
	/** 参加登録。トークンを受け取り、以降の subscribe で使う */
	join: (
		request: {gameId: string; name: string},
		ack: Ack<{token: string; participantId: string}>,
	) => void;
	/** ゲームの購読を始める。以降 `game` イベントが届く。1つの接続で購読できるゲームは1つ */
	subscribe: (request: SubscribeRequest, ack: Ack<{participantId: string | null}>) => void;
	/** 購読中のゲームにコマンドを送る */
	command: (command: {type: string} & Record<string, unknown>, ack: Ack) => void;
	/** 直近の操作を取り消す (司会者のみ) */
	undo: (ack: Ack<{undone: string}>) => void;
}

export interface ServerToClientEvents {
	game: (view: GameView) => void;
	/** ゲーム一覧が変わった */
	gamesChanged: () => void;
	/** 購読中のゲームから外された (ゲームの削除、参加者の削除など) */
	kicked: (reason: string) => void;
}
