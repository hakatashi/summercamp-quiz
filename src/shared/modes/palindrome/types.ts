import {z} from 'zod';

/** ヒントごとのペナルティ (ミリ秒) */
export const HINT_PENALTIES = {
	situation: 50_000,
	irasutoya: 40_000,
	charTypes: 20_000,
} as const;

export type HintKind = keyof typeof HINT_PENALTIES;

export const HINT_NAMES: Record<HintKind, string> = {
	situation: '状況説明',
	irasutoya: 'いらすとや',
	charTypes: '文字種',
};

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

export type PalindromePhase = 'waiting' | 'open' | 'closed' | 'finished';

export interface PalindromeParticipantRecord {
	hints: Partial<Record<HintKind, number>>;
	wrong: Array<{text: string; at: number}>;
	correctAt: number | null;
}

export interface PalindromeQuestionRecord {
	questionId: string;
	openedAt: number;
	closedAt: number | null;
	participants: Record<string, PalindromeParticipantRecord>;
}

export interface PalindromeState {
	phase: PalindromePhase;
	history: PalindromeQuestionRecord[];
	showStandings: boolean;
}

export const palindromeCommandSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('next'),
		questionId: z.string().optional(),
	}),
	z.object({
		type: z.literal('close'),
	}),
	z.object({
		type: z.literal('finish'),
	}),
	z.object({
		type: z.literal('showStandings'),
		show: z.boolean(),
	}),
	z.object({
		type: z.literal('openHint'),
		kind: z.enum(['situation', 'irasutoya', 'charTypes']),
		participantId: z.string().optional(),
	}),
	z.object({
		type: z.literal('answer'),
		text: z.string().max(100),
		participantId: z.string().optional(),
	}),
]);
export type PalindromeCommand = z.infer<typeof palindromeCommandSchema>;
