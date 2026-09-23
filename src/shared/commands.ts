import {z} from 'zod';
import type {Role} from './types.ts';

/** 問題の入力。id はサーバーが振るので省略できる */
export const questionInputSchema = z.object({
	id: z.string().min(1).optional(),
	text: z.string().max(5000),
	answer: z.string().max(1000),
	note: z.string().max(5000).default(''),
	extra: z.record(z.string(), z.unknown()).default({}),
});
export type QuestionInput = z.input<typeof questionInputSchema>;

const participantName = z.string().trim().min(1).max(20);

/** 全企画共通のコマンド */
export const commonCommandSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('questions.add'),
		question: questionInputSchema,
		/** 挿入位置 (省略すると末尾) */
		index: z.number().int().min(0).optional(),
	}),
	z.object({
		type: z.literal('questions.update'),
		id: z.string(),
		text: z.string().max(5000).optional(),
		answer: z.string().max(1000).optional(),
		note: z.string().max(5000).optional(),
		extra: z.record(z.string(), z.unknown()).optional(),
	}),
	z.object({type: z.literal('questions.delete'), id: z.string()}),
	z.object({type: z.literal('questions.move'), id: z.string(), toIndex: z.number().int().min(0)}),
	z.object({
		type: z.literal('questions.import'),
		questions: z.array(questionInputSchema).max(2000),
		/** true なら既存の問題を全て置き換える */
		replace: z.boolean(),
	}),
	z.object({
		type: z.literal('participants.join'),
		participantId: z.string(),
		name: participantName,
	}),
	z.object({
		type: z.literal('participants.rename'),
		participantId: z.string(),
		name: participantName,
	}),
	z.object({type: z.literal('participants.remove'), participantId: z.string()}),
	z.object({type: z.literal('game.rename'), title: z.string().trim().min(1).max(100)}),
	z.object({type: z.literal('review.start')}),
	z.object({type: z.literal('review.move'), index: z.number().int()}),
	z.object({type: z.literal('review.end')}),
]);
export type CommonCommand = z.infer<typeof commonCommandSchema>;
export type CommonCommandType = CommonCommand['type'];

export const commonPermissions: {[K in CommonCommandType]: readonly Role[]} = {
	'questions.add': ['host'],
	'questions.update': ['host'],
	'questions.delete': ['host'],
	'questions.move': ['host'],
	'questions.import': ['host'],
	// participants.join はサーバー (system) だけが発行する
	'participants.join': [],
	'participants.rename': ['host'],
	'participants.remove': ['host'],
	'game.rename': ['host'],
	'review.start': ['host'],
	'review.move': ['host'],
	'review.end': ['host'],
};

export const isCommonCommandType = (type: string): type is CommonCommandType =>
	Object.hasOwn(commonPermissions, type);

/** 取り消し (undo) の対象にしないコマンド。問題の編集や参加登録、感想戦は別の画面や移動の操作なので巻き込まない */
export const isUndoableCommandType = (type: string) =>
	!type.startsWith('questions.') && !type.startsWith('review.') && type !== 'participants.join';
