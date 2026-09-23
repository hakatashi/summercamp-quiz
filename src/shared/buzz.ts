import {z} from 'zod';

/** クライアントが申告した押下時刻を、受信時刻からどこまで遡って信用するか (ミリ秒) */
export const BUZZ_GRACE_MS = 500;

export const buzzDiagSchema = z.object({
	/** 往復時間 (ミリ秒) */
	rtt: z.number(),
	/** クライアント時刻 + offset = サーバー時刻 (ミリ秒) */
	offset: z.number(),
});
export type BuzzDiag = z.infer<typeof buzzDiagSchema>;

export const buzzCommandSchema = z.object({
	type: z.literal('buzz'),
	pressedAt: z.number(),
	diag: buzzDiagSchema.optional(),
});
export type BuzzCommand = z.infer<typeof buzzCommandSchema>;

export type BuzzStatus =
	/** 回答権の順番待ち */
	| 'waiting'
	/** 回答中 */
	| 'answering'
	| 'correct'
	| 'wrong'
	/** 問題の終了やリセットで無効になった */
	| 'void';

export interface Buzz {
	participantId: string;
	/** 押した時刻 (サーバー時刻に換算し、補正済み) */
	pressedAt: number;
	receivedAt: number;
	status: BuzzStatus;
}

/**
 * 申告された押下時刻を補正する。
 * [受信時刻 - BUZZ_GRACE_MS, 受信時刻] に丸め、さらに出題開始時刻より前にならないようにする。
 */
export const adjustPressedAt = (
	declaredPressedAt: number,
	startedAt: number,
	receivedAt: number,
	graceMs: number = BUZZ_GRACE_MS,
): number => {
	return Math.max(startedAt, receivedAt - graceMs, Math.min(declaredPressedAt, receivedAt));
};

/**
 * 未判定の押下 (waiting / answering) を押下時刻順 (タイなら受信時刻順) に並び替え、
 * 先頭を answering、以降を waiting に更新する。
 * 判定済みの押下の順序や状態は維持する。
 */
export const arrangeBuzzes = <T extends Buzz>(
	buzzes: T[],
): {
	buzzes: T[];
	hasAnswerer: boolean;
} => {
	const judged = buzzes.filter((b) => b.status !== 'waiting' && b.status !== 'answering');
	const pending = buzzes
		.filter((b) => b.status === 'waiting' || b.status === 'answering')
		.sort((a, b) => a.pressedAt - b.pressedAt || a.receivedAt - b.receivedAt);
	pending.forEach((buzz, i) => {
		buzz.status = i === 0 ? 'answering' : 'waiting';
	});
	return {
		buzzes: [...judged, ...pending],
		hasAnswerer: pending.length > 0,
	};
};

/**
 * 新しい押下を受け付けてリストに追加し、未判定押下を整列する。
 */
export const registerBuzz = <T extends Buzz>(
	existingBuzzes: T[],
	entry: {
		participantId: string;
		declaredPressedAt: number;
		startedAt: number;
		receivedAt: number;
		graceMs?: number;
	},
): {buzzes: T[]; pressedAt: number} => {
	const pressedAt = adjustPressedAt(
		entry.declaredPressedAt,
		entry.startedAt,
		entry.receivedAt,
		entry.graceMs,
	);
	const filtered = existingBuzzes.filter((b) => b.participantId !== entry.participantId);
	const newBuzz = {
		participantId: entry.participantId,
		pressedAt,
		receivedAt: entry.receivedAt,
		status: 'waiting',
	} as T;
	const {buzzes} = arrangeBuzzes([...filtered, newBuzz]);
	return {buzzes, pressedAt};
};
