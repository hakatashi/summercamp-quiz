import {z} from 'zod';

/** ヒントごとのペナルティ (ミリ秒) */
export const HINT_PENALTIES = {
	situation: 50_000,
	irasutoya: 40_000,
	charTypes: 20_000,
} as const;

export type HintKind = keyof typeof HINT_PENALTIES;

export const HINT_KINDS: HintKind[] = ['situation', 'irasutoya', 'charTypes'];

export const HINT_NAMES: Record<HintKind, string> = {
	situation: '状況説明',
	irasutoya: 'いらすとや',
	charTypes: '文字種',
};

/** 制限時間の既定値 (ミリ秒) */
export const DEFAULT_DURATION_MS = 30 * 60_000;

/** 制限時間・延長として指定できる最大の分数 */
export const MAX_DURATION_MINUTES = 300;

export const palindromeQuestionExtraSchema = z.object({
	image: z.string(),
	notation: z.string(),
	altAnswers: z.array(z.string()).default([]),
	hints: z.object({
		situation: z.string(),
		irasutoya: z.string(),
		charTypes: z.string().optional(),
	}),
});
export type PalindromeQuestionExtra = z.infer<typeof palindromeQuestionExtraSchema>;

/** 開始前 / 開催中 (時間切れ後も finish までは running) / 終了 */
export type PalindromePhase = 'waiting' | 'running' | 'finished';

/** 参加者1人の、1問への取り組みの記録 */
export interface PalindromeAttempt {
	/** 開けたヒントと、開けた時刻 */
	hints: Partial<Record<HintKind, number>>;
	wrong: Array<{text: string; at: number}>;
	correctAt: number | null;
}

export interface PalindromeState {
	phase: PalindromePhase;
	/** 制限時間 (開始前に設定する) */
	durationMs: number;
	startedAt: number | null;
	/** 終了予定時刻 (開始時刻 + 制限時間 + 延長分) */
	endsAt: number | null;
	/** 実際に終わった時刻 (打ち切ったときは打ち切った時刻) */
	finishedAt: number | null;
	/** 開始時点の問題の並び。A, B, C… の番号はこの順に振る */
	questionIds: string[];
	/** questionId → participantId → 記録 */
	attempts: Record<string, Record<string, PalindromeAttempt>>;
}

const minutes = z.number().int().min(1).max(MAX_DURATION_MINUTES);

export const palindromeCommandSchema = z.discriminatedUnion('type', [
	z.object({type: z.literal('setDuration'), minutes}),
	z.object({type: z.literal('start')}),
	z.object({type: z.literal('extend'), minutes}),
	z.object({type: z.literal('finish')}),
	z.object({
		type: z.literal('openHint'),
		questionId: z.string(),
		kind: z.enum(['situation', 'irasutoya', 'charTypes']),
		participantId: z.string().optional(),
	}),
	z.object({
		type: z.literal('answer'),
		questionId: z.string(),
		text: z.string().max(100),
		participantId: z.string().optional(),
	}),
]);
export type PalindromeCommand = z.infer<typeof palindromeCommandSchema>;
