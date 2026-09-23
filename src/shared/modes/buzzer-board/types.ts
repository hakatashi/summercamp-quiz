import {z} from 'zod';
import {type Buzz, type BuzzDiag, type BuzzStatus, buzzCommandSchema} from '../../buzz.ts';

export const GENRES = [
	'ノンジャンル',
	'スポーツ',
	'世界史',
	'公民',
	'地理',
	'文学',
	'日本史',
	'漫画・アニメ・ゲーム',
	'生活',
	'科学',
	'芸能',
	'芸術',
	'言葉',
] as const;

export type Genre = (typeof GENRES)[number];
export const genreSchema = z.enum(GENRES);

export const questionExtraSchema = z.object({
	genre: genreSchema,
});
export type BuzzerBoardQuestionExtra = z.infer<typeof questionExtraSchema>;

export type QuestionResult = 'correct' | 'wrong' | 'through' | 'cancelled';

export interface ScoreBreakdown {
	base: number;
	bonus: number;
}

export interface BoardAnswer {
	participantId: string;
	text: string;
	submittedAt: number | null;
	correct: boolean | null;
}

export interface BoardRecord {
	answers: Record<string, BoardAnswer>;
	closedAt: number | null;
	confirmedAt: number | null;
}

export interface QuestionRecord {
	questionId: string;
	startedAt: number;
	endedAt: number | null;
	genre: Genre;
	scoresBefore: Record<string, number>;
	restBefore: Record<string, number>;
	clearedBefore: Record<string, boolean>;
	streakBefore: {participantId: string; count: number} | null;
	nextGenreBefore: {genre: Genre; chosenBy: string | null};
	genreChooserBefore: string | null;
	buzzes: Buzz[];
	result: QuestionResult | null;
	breakdown: ScoreBreakdown | null;
	board: BoardRecord | null;
}

export type Phase =
	| 'waiting'
	| 'reading'
	| 'answering'
	| 'board-answering'
	| 'board-judging'
	| 'closed'
	| 'finished';

export interface BuzzerBoardState {
	phase: Phase;
	scores: Record<string, number>;
	rest: Record<string, number>;
	cleared: Record<string, boolean>;
	streak: {participantId: string; count: number} | null;
	nextGenre: {genre: Genre; chosenBy: string | null};
	genreChooser: string | null;
	history: QuestionRecord[];
	unaskedCounts: Record<Genre, number>;
}

export const buzzerBoardCommandSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('next'),
		questionId: z.string().optional(),
		seed: z.number().int().optional(),
	}),
	buzzCommandSchema,
	z.object({type: z.literal('judge'), correct: z.boolean()}),
	z.object({type: z.literal('through')}),
	z.object({type: z.literal('chooseGenre'), genre: genreSchema}),
	z.object({type: z.literal('cancel'), returnToPool: z.boolean()}),
	z.object({type: z.literal('resetBuzzes')}),
	z.object({type: z.literal('setScore'), participantId: z.string(), score: z.number().int()}),
	z.object({type: z.literal('setRest'), participantId: z.string(), rest: z.number().int().min(0)}),
	z.object({type: z.literal('setCleared'), participantId: z.string(), cleared: z.boolean()}),
	z.object({
		type: z.literal('setStreak'),
		participantId: z.string().nullable(),
		count: z.number().int().min(0),
	}),
	z.object({type: z.literal('setNextGenre'), genre: genreSchema}),
	z.object({type: z.literal('boardSubmit'), text: z.string()}),
	z.object({type: z.literal('boardClose')}),
	z.object({
		type: z.literal('boardMark'),
		participantId: z.string(),
		correct: z.boolean().nullable(),
	}),
	z.object({type: z.literal('boardConfirm')}),
	z.object({type: z.literal('boardReopen')}),
]);

export type BuzzerBoardCommand = z.infer<typeof buzzerBoardCommandSchema>;
export type {Buzz, BuzzDiag, BuzzStatus};
