import {z} from 'zod';
import {type CommandContext, CommandError, type Game, type Question} from '../../types.ts';
import type {ModeDefinition} from '../types.ts';

/** クライアントが申告した押下時刻を、受信時刻からどこまで遡って信用するか (ミリ秒) */
export const BUZZ_GRACE_MS = 500;

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

export type QuestionResult =
	/** 誰かが正解した */
	| 'correct'
	/** 参加者全員が誤答した */
	| 'all-wrong'
	/** 読み切り (スルー) */
	| 'through'
	/** 司会者が出題を取り消した */
	| 'cancelled';

/** 出題1回分の記録。感想戦でも使う */
export interface QuestionRecord {
	questionId: string;
	startedAt: number;
	endedAt: number | null;
	/** 出題前の得点 */
	scoresBefore: Record<string, number>;
	buzzes: Buzz[];
	result: QuestionResult | null;
}

export type Phase =
	/** まだ1問も出題していない */
	| 'waiting'
	/** 問題を読み上げ中 (ボタンを押せる) */
	| 'reading'
	/** 誰かが回答中 */
	| 'answering'
	/** 問題が終了した */
	| 'closed'
	/** 全問終了 */
	| 'finished';

export interface SimpleBuzzerState {
	phase: Phase;
	scores: Record<string, number>;
	/** 出題した問題の記録 (出題順)。phase が reading / answering / closed なら末尾が現在の問題 */
	history: QuestionRecord[];
}

export const simpleBuzzerCommandSchema = z.discriminatedUnion('type', [
	/** 次の問題を出題する。questionId を省略すると未出題の問題を並び順で選ぶ */
	z.object({type: z.literal('next'), questionId: z.string().optional()}),
	z.object({type: z.literal('buzz'), pressedAt: z.number()}),
	z.object({type: z.literal('judge'), correct: z.boolean()}),
	/** 読み切り (スルー)。現在の問題を終了する */
	z.object({type: z.literal('close')}),
	/** 出題を取り消す。returnToPool なら未出題に戻す */
	z.object({type: z.literal('cancel'), returnToPool: z.boolean()}),
	/** 判定前のボタン押下を取り消し、読み上げに戻る */
	z.object({type: z.literal('resetBuzzes')}),
	z.object({type: z.literal('setScore'), participantId: z.string(), score: z.number().int()}),
]);
export type SimpleBuzzerCommand = z.infer<typeof simpleBuzzerCommandSchema>;

type G = Game<SimpleBuzzerState>;

export const currentRecord = (state: SimpleBuzzerState): QuestionRecord | null =>
	state.phase === 'reading' || state.phase === 'answering' || state.phase === 'closed'
		? (state.history.at(-1) ?? null)
		: null;

const requireOpenRecord = (state: SimpleBuzzerState) => {
	const record = currentRecord(state);
	if (!record || (state.phase !== 'reading' && state.phase !== 'answering')) {
		throw new CommandError('出題中の問題がありません');
	}
	return record;
};

/** 出題済み (取り消して未出題に戻したものを除く) の問題 ID */
export const askedQuestionIds = (state: SimpleBuzzerState) =>
	new Set(state.history.map((r) => r.questionId));

export const unaskedQuestions = (game: G): Question[] => {
	const asked = askedQuestionIds(game.state);
	return game.questions.filter((q) => !asked.has(q.id));
};

export const scoreOf = (state: SimpleBuzzerState, participantId: string) =>
	state.scores[participantId] ?? 0;

const addScore = (state: SimpleBuzzerState, participantId: string, delta: number) => {
	state.scores[participantId] = scoreOf(state, participantId) + delta;
};

const endQuestion = (
	state: SimpleBuzzerState,
	record: QuestionRecord,
	result: QuestionResult,
	now: number,
) => {
	for (const buzz of record.buzzes) {
		if (buzz.status === 'waiting' || buzz.status === 'answering') {
			buzz.status = 'void';
		}
	}
	record.result = result;
	record.endedAt = now;
	state.phase = 'closed';
};

/** 未判定の押下を押した順に並べ、先頭に回答権を与える。回答者がいれば true */
const assignAnswerer = (state: SimpleBuzzerState, record: QuestionRecord) => {
	const judged = record.buzzes.filter((b) => b.status !== 'waiting' && b.status !== 'answering');
	const pending = record.buzzes
		.filter((b) => b.status === 'waiting' || b.status === 'answering')
		.sort((a, b) => a.pressedAt - b.pressedAt || a.receivedAt - b.receivedAt);
	pending.forEach((buzz, i) => {
		buzz.status = i === 0 ? 'answering' : 'waiting';
	});
	record.buzzes = [...judged, ...pending];
	state.phase = pending.length > 0 ? 'answering' : 'reading';
	return pending.length > 0;
};

const apply = (game: G, command: SimpleBuzzerCommand, ctx: CommandContext) => {
	const {state} = game;
	switch (command.type) {
		case 'next': {
			if (state.phase === 'reading' || state.phase === 'answering') {
				throw new CommandError('出題中の問題を終了してから次に進んでください');
			}
			const candidates = unaskedQuestions(game);
			const question =
				command.questionId === undefined
					? candidates[0]
					: candidates.find((q) => q.id === command.questionId);
			if (!question) {
				if (command.questionId !== undefined) {
					throw new CommandError('その問題は出題できません');
				}
				state.phase = 'finished';
				return;
			}
			state.history.push({
				questionId: question.id,
				startedAt: ctx.now,
				endedAt: null,
				scoresBefore: Object.fromEntries(
					game.participants.map((p) => [p.id, scoreOf(state, p.id)]),
				),
				buzzes: [],
				result: null,
			});
			state.phase = 'reading';
			return;
		}
		case 'buzz': {
			if (ctx.actor.role !== 'participant') {
				throw new CommandError('参加者だけがボタンを押せます');
			}
			const {participantId} = ctx.actor;
			if (!game.participants.some((p) => p.id === participantId)) {
				throw new CommandError('参加者として登録されていません');
			}
			const record = requireOpenRecord(state);
			if (record.buzzes.some((b) => b.participantId === participantId && b.status !== 'void')) {
				throw new CommandError('この問題では既にボタンを押しています');
			}
			const pressedAt = Math.max(
				record.startedAt,
				ctx.now - BUZZ_GRACE_MS,
				Math.min(command.pressedAt, ctx.now),
			);
			record.buzzes = record.buzzes.filter((b) => b.participantId !== participantId);
			record.buzzes.push({participantId, pressedAt, receivedAt: ctx.now, status: 'waiting'});
			assignAnswerer(state, record);
			return;
		}
		case 'judge': {
			const record = requireOpenRecord(state);
			const answering = record.buzzes.find((b) => b.status === 'answering');
			if (!answering) {
				throw new CommandError('回答中の参加者がいません');
			}
			if (command.correct) {
				answering.status = 'correct';
				addScore(state, answering.participantId, 1);
				endQuestion(state, record, 'correct', ctx.now);
				return;
			}
			answering.status = 'wrong';
			addScore(state, answering.participantId, -1);
			if (assignAnswerer(state, record)) {
				return;
			}
			const wrong = new Set(
				record.buzzes.filter((b) => b.status === 'wrong').map((b) => b.participantId),
			);
			if (game.participants.every((p) => wrong.has(p.id))) {
				endQuestion(state, record, 'all-wrong', ctx.now);
			}
			return;
		}
		case 'close': {
			const record = requireOpenRecord(state);
			endQuestion(state, record, 'through', ctx.now);
			return;
		}
		case 'cancel': {
			const record = currentRecord(state);
			if (!record) {
				throw new CommandError('取り消せる問題がありません');
			}
			const alreadyCancelled = record.result === 'cancelled';
			if (alreadyCancelled && !command.returnToPool) {
				throw new CommandError('この問題は既に取り消されています');
			}
			// 判定済みの得点変動を巻き戻す (取り消し済みなら巻き戻し済み)
			if (!alreadyCancelled) {
				for (const buzz of record.buzzes) {
					if (buzz.status === 'correct') addScore(state, buzz.participantId, -1);
					if (buzz.status === 'wrong') addScore(state, buzz.participantId, 1);
				}
			}
			if (command.returnToPool) {
				state.history.pop();
			} else {
				endQuestion(state, record, 'cancelled', ctx.now);
			}
			state.phase = state.history.length > 0 ? 'closed' : 'waiting';
			return;
		}
		case 'resetBuzzes': {
			const record = requireOpenRecord(state);
			record.buzzes = record.buzzes.filter(
				(b) => b.status !== 'waiting' && b.status !== 'answering',
			);
			state.phase = 'reading';
			return;
		}
		case 'setScore': {
			if (!game.participants.some((p) => p.id === command.participantId)) {
				throw new CommandError('参加者が見つかりません');
			}
			state.scores[command.participantId] = command.score;
			return;
		}
	}
};

const resultLabels: Record<QuestionResult, string> = {
	correct: '正解',
	'all-wrong': '全員誤答',
	through: 'スルー',
	cancelled: '取り消し',
};
export const describeResult = (result: QuestionResult) => resultLabels[result];

export const simpleBuzzer: ModeDefinition<SimpleBuzzerState, SimpleBuzzerCommand> = {
	id: 'simple-buzzer',
	name: 'シンプル早押しクイズ',
	questionExtraSchema: z.object({}),
	commandSchema: simpleBuzzerCommandSchema,
	permissions: {
		next: ['host'],
		buzz: ['participant'],
		judge: ['host'],
		close: ['host'],
		cancel: ['host'],
		resetBuzzes: ['host'],
		setScore: ['host'],
	},
	initialState: () => ({phase: 'waiting', scores: {}, history: []}),
	apply,
	onParticipantJoined(game, participantId) {
		game.state.scores[participantId] ??= 0;
	},
	onParticipantRemoved(game, participantId) {
		delete game.state.scores[participantId];
		const record = currentRecord(game.state);
		if (record && (game.state.phase === 'reading' || game.state.phase === 'answering')) {
			record.buzzes = record.buzzes.filter((b) => b.participantId !== participantId);
			assignAnswerer(game.state, record);
		}
	},
	project(game, viewer) {
		if (viewer.role === 'host') {
			return game;
		}
		// 参加者とモニターには、終了した問題の問題文と答えだけを見せる
		const open = game.state.phase === 'reading' || game.state.phase === 'answering';
		const openId = open ? game.state.history.at(-1)?.questionId : undefined;
		const visible = new Set(
			game.state.history.map((r) => r.questionId).filter((id) => id !== openId),
		);
		return {
			...game,
			questions: game.questions.filter((q) => visible.has(q.id)).map((q) => ({...q, note: ''})),
		};
	},
	describe(command, game) {
		const name = (id: string) => game.participants.find((p) => p.id === id)?.name ?? '?';
		switch (command.type) {
			case 'next':
				return '次の問題へ';
			case 'buzz':
				return 'ボタン押下';
			case 'judge':
				return command.correct ? '正解判定' : '誤答判定';
			case 'close':
				return 'スルー (問題終了)';
			case 'cancel':
				return command.returnToPool ? '出題の取り消し (未出題に戻す)' : '出題の取り消し';
			case 'resetBuzzes':
				return 'ボタン押下のリセット';
			case 'setScore':
				return `${name(command.participantId)} の得点を ${command.score} に変更`;
		}
	},
};
