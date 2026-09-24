import {z} from 'zod';
import {type CommandContext, CommandError, type Game, type Question} from '../../types.ts';
import type {ModeDefinition} from '../types.ts';

export const listeningMathQuestionExtraSchema = z.object({
	/** 問題音声のメディア ID。TSV で問題文だけ先に取り込めるよう空文字を許し、出題開始時に確認する */
	audio: z.string().default(''),
	/** 解き方の解説。複数行で書け、`$...$` / `$$...$$` で TeX の数式を埋め込める。振り返りで表示する */
	explanation: z.string().max(5000).default(''),
	/** 出典 (例: `オリジナル`、`2019 AMC 12A Problem 19 (改)`)。振り返りで小さく表示する */
	source: z.string().max(200).default(''),
});
export type ListeningMathQuestionExtra = z.infer<typeof listeningMathQuestionExtraSchema>;

export type ListeningMathPhase =
	/** 出題前、または停止中 */
	| 'idle'
	/** 問題音声を連続再生中 */
	| 'playing'
	/** 全問の再生が終わった */
	| 'played';

export interface ListeningMathState {
	phase: ListeningMathPhase;
	/** 再生中 (停止中なら最後に再生していた) 問題の番号 (0 始まり) */
	currentIndex: number;
	/** 出題を開始した時刻 */
	startedAt: number | null;
	/** 問題と問題の間隔 (秒)。0 ならノンストップ */
	intervalSeconds: number;
}

/** 問題の間隔の上限 (秒) */
export const MAX_INTERVAL_SECONDS = 60;

export const listeningMathCommandSchema = z.discriminatedUnion('type', [
	/** 出題を開始する。index を省略すると先頭から */
	z.object({type: z.literal('play'), index: z.number().int().min(0).optional()}),
	/** モニターが今どの問題を再生しているかを報告する (再読込したときに続きから再開するため) */
	z.object({type: z.literal('progress'), index: z.number().int().min(0)}),
	/** 出題を途中で止める */
	z.object({type: z.literal('stop')}),
	/** 全問の再生が終わった */
	z.object({type: z.literal('finish')}),
	z.object({
		type: z.literal('setInterval'),
		seconds: z.number().min(0).max(MAX_INTERVAL_SECONDS),
	}),
]);
export type ListeningMathCommand = z.infer<typeof listeningMathCommandSchema>;

type G = Game<ListeningMathState>;

export const questionExtra = (question: Question): ListeningMathQuestionExtra =>
	listeningMathQuestionExtraSchema.parse(question.extra);

/** 音声が登録されていない問題の番号 (1 始まり) */
export const questionsWithoutAudio = (questions: readonly Question[]): number[] =>
	questions.flatMap((q, i) => (typeof q.extra.audio === 'string' && q.extra.audio ? [] : [i + 1]));

const requireIndex = (game: G, index: number) => {
	if (index >= game.questions.length) {
		throw new CommandError('その番号の問題はありません');
	}
	return index;
};

const apply = (game: G, command: ListeningMathCommand, ctx: CommandContext) => {
	const {state} = game;
	switch (command.type) {
		case 'play': {
			if (game.review !== null) {
				throw new CommandError('振り返りを終えてから出題してください');
			}
			if (game.questions.length === 0) {
				throw new CommandError('問題がありません');
			}
			const missing = questionsWithoutAudio(game.questions);
			if (missing.length > 0) {
				throw new CommandError(
					`音声が登録されていない問題があります (第 ${missing.join('、')} 問)`,
				);
			}
			state.phase = 'playing';
			state.currentIndex = requireIndex(game, command.index ?? 0);
			state.startedAt = ctx.now;
			return;
		}
		case 'progress': {
			if (state.phase !== 'playing') {
				throw new CommandError('出題中ではありません');
			}
			state.currentIndex = requireIndex(game, command.index);
			return;
		}
		case 'stop': {
			if (state.phase !== 'playing') {
				throw new CommandError('出題中ではありません');
			}
			state.phase = 'idle';
			return;
		}
		case 'finish': {
			if (state.phase !== 'playing') {
				throw new CommandError('出題中ではありません');
			}
			state.phase = 'played';
			return;
		}
		case 'setInterval': {
			state.intervalSeconds = command.seconds;
			return;
		}
	}
};

export const listeningMath: ModeDefinition<ListeningMathState, ListeningMathCommand> = {
	id: 'listening-math',
	name: 'リスニング数学',
	questionExtraSchema: listeningMathQuestionExtraSchema,
	commandSchema: listeningMathCommandSchema,
	permissions: {
		play: ['monitor', 'host'],
		progress: ['monitor', 'host'],
		stop: ['monitor', 'host'],
		finish: ['monitor', 'host'],
		setInterval: ['monitor', 'host'],
	},
	reviewPermissions: ['monitor', 'host'],
	monitorRequiresHost: true,
	initialState: () => ({phase: 'idle', currentIndex: 0, startedAt: null, intervalSeconds: 0}),
	apply,
	project(game, viewer) {
		if (viewer.role === 'host') {
			return game;
		}
		// 振り返り中だけ問題文・正解・解説・出典を送る。出題中にうっかり表示しないよう、それ以外は音声だけにする
		const reviewing = game.review !== null;
		return {
			...game,
			questions: game.questions.map((q) => {
				const extra = questionExtra(q);
				return reviewing
					? {...q, note: '', extra}
					: {...q, text: '', answer: '', note: '', extra: {audio: extra.audio}};
			}),
		};
	},
	reviewItems(game) {
		return game.questions.map((q, index) => ({questionId: q.id, recordIndex: index}));
	},
	describe(command) {
		switch (command.type) {
			case 'play':
				return `出題を開始 (第 ${(command.index ?? 0) + 1} 問から)`;
			case 'progress':
				return `第 ${command.index + 1} 問を再生`;
			case 'stop':
				return '出題を停止';
			case 'finish':
				return '出題を終了';
			case 'setInterval':
				return `問題の間隔を ${command.seconds} 秒に変更`;
		}
	},
};
