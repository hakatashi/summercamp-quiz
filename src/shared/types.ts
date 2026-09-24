/** 企画の種類。新しい企画を追加したらここにも足す */
export type ModeId = 'simple-buzzer' | 'buzzer-board' | 'palindrome' | 'listening-math';

export type Role = 'host' | 'participant' | 'monitor';

/** 画面を見ている人。投影 (project) の単位 */
export type Viewer =
	| {role: 'host'}
	| {role: 'monitor'}
	| {role: 'participant'; participantId: string};

/** コマンドを実行した主体 */
export type Actor =
	| {role: 'host'}
	| {role: 'participant'; participantId: string}
	| {role: 'monitor'}
	| {role: 'system'};

export interface Participant {
	id: string;
	name: string;
	joinedAt: number;
	kind: 'human' | 'ai';
}

export interface Question {
	id: string;
	text: string;
	answer: string;
	/** 司会者向けのメモ (別解、読み上げの注意など) */
	note: string;
	/** 企画ごとの追加フィールド (ModeDefinition.questionExtraSchema で検証する) */
	extra: Record<string, unknown>;
}

export interface ReviewItem {
	questionId: string;
	recordIndex: number;
}

export interface Game<S = unknown> {
	id: string;
	mode: ModeId;
	title: string;
	createdAt: number;
	questions: Question[];
	participants: Participant[];
	state: S;
	review: {index: number} | null;
}

/** サーバーからクライアントに届く、閲覧者ごとに投影済みのゲーム */
export interface GameView<S = unknown> {
	game: Game<S>;
	/** 単調増加。古い state を捨てるのに使う */
	version: number;
	/** 接続中の参加者 ID */
	online: string[];
	/** 投影で問題リストが絞られていても分かるように、全問題数を別に送る */
	questionCount: number;
	/** 司会者向け: 取り消せる直近の操作の説明 */
	undoable: string | null;
}

export interface GameSummary {
	id: string;
	mode: ModeId;
	title: string;
	createdAt: number;
	participantCount: number;
	questionCount: number;
}

export interface CommandContext {
	/** サーバーがコマンドを受け取った時刻 (ミリ秒) */
	now: number;
	actor: Actor;
}

/** コマンドを拒否するときに投げる。メッセージはそのままクライアントに表示する */
export class CommandError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CommandError';
	}
}
