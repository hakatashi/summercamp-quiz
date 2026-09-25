import {
	type Actor,
	type CommandContext,
	CommandError,
	type Game,
	type Question,
	type Viewer,
} from '../../types.ts';
import type {ModeDefinition} from '../types.ts';
import {generateCharTypes, getCharTypesHint} from './charTypes.ts';
import {
	computeQuestionPenalty,
	computeQuestionSummary,
	computeStandings,
	type PalindromeCell,
	type PalindromeQuestionSummary,
	type PalindromeSolver,
	type PalindromeStanding,
	questionLabel,
} from './scoring.ts';
import {
	DEFAULT_DURATION_MS,
	HINT_KINDS,
	HINT_NAMES,
	HINT_PENALTIES,
	type HintKind,
	MAX_DURATION_MINUTES,
	type PalindromeAttempt,
	type PalindromeCommand,
	type PalindromePhase,
	type PalindromeQuestionExtra,
	type PalindromeState,
	palindromeCommandSchema,
	palindromeQuestionExtraSchema,
} from './types.ts';
import {
	checkAnswer,
	getAnswerValidationError,
	isPalindromeRelaxed,
	normalizeAnswerText,
} from './validation.ts';

export {
	checkAnswer,
	computeQuestionPenalty,
	computeQuestionSummary,
	computeStandings,
	DEFAULT_DURATION_MS,
	generateCharTypes,
	getAnswerValidationError,
	getCharTypesHint,
	HINT_KINDS,
	HINT_NAMES,
	HINT_PENALTIES,
	type HintKind,
	isPalindromeRelaxed,
	MAX_DURATION_MINUTES,
	normalizeAnswerText,
	type PalindromeAttempt,
	type PalindromeCell,
	type PalindromeCommand,
	type PalindromePhase,
	type PalindromeQuestionExtra,
	type PalindromeQuestionSummary,
	type PalindromeSolver,
	type PalindromeStanding,
	type PalindromeState,
	palindromeCommandSchema,
	palindromeQuestionExtraSchema,
	questionLabel,
};

type G = Game<PalindromeState>;

/** 開催中の問題 (開始時点の並び)。削除された問題は除く */
export const contestQuestions = (game: G): Question[] =>
	game.state.questionIds.flatMap((id) => game.questions.find((q) => q.id === id) ?? []);

/** 回答とヒントを受け付けているか (時間切れ後は finish 前でも受け付けない) */
export const isAccepting = (state: PalindromeState, now: number): boolean =>
	state.phase === 'running' && state.endsAt !== null && now < state.endsAt;

/** 答えを公開してよいか */
export const isRevealed = (game: G): boolean =>
	game.state.phase === 'finished' || game.review !== null;

const emptyAttempt = (): PalindromeAttempt => ({hints: {}, wrong: [], correctAt: null});

const resolveParticipantId = (
	actor: Actor,
	commandParticipantId: string | undefined,
	participants: {id: string}[],
): string => {
	let pid: string;
	if (actor.role === 'system') {
		if (!commandParticipantId) {
			throw new CommandError('participantId が指定されていません');
		}
		pid = commandParticipantId;
	} else if (actor.role === 'participant') {
		pid = actor.participantId;
	} else {
		throw new CommandError('参加者として実行してください');
	}

	if (!participants.some((p) => p.id === pid)) {
		throw new CommandError('参加者として登録されていません');
	}
	return pid;
};

/** 回答・ヒントの対象になる記録を取り出す (なければ作る) */
const attemptFor = (
	game: G,
	command: {questionId: string; participantId?: string | undefined},
	ctx: CommandContext,
): {attempt: PalindromeAttempt; question: Question} => {
	const {state} = game;
	if (state.phase === 'waiting') {
		throw new CommandError('コンテストはまだ始まっていません');
	}
	if (!isAccepting(state, ctx.now)) {
		throw new CommandError('コンテストは終了しました');
	}
	const pid = resolveParticipantId(ctx.actor, command.participantId, game.participants);
	const question = state.questionIds.includes(command.questionId)
		? game.questions.find((q) => q.id === command.questionId)
		: undefined;
	if (!question) {
		throw new CommandError('問題が見つかりません');
	}
	state.attempts[question.id] ??= {};
	const byParticipant = state.attempts[question.id] ?? {};
	byParticipant[pid] ??= emptyAttempt();
	const attempt = byParticipant[pid] ?? emptyAttempt();
	if (attempt.correctAt !== null) {
		throw new CommandError('既に正解しています');
	}
	return {attempt, question};
};

const apply = (game: G, command: PalindromeCommand, ctx: CommandContext) => {
	const {state} = game;
	switch (command.type) {
		case 'setDuration': {
			if (state.phase !== 'waiting') {
				throw new CommandError('開始後は制限時間を変えられません (延長を使ってください)');
			}
			state.durationMs = command.minutes * 60_000;
			return;
		}
		case 'start': {
			if (state.phase !== 'waiting') {
				throw new CommandError('コンテストはすでに始まっています');
			}
			if (game.questions.length === 0) {
				throw new CommandError('問題がありません');
			}
			state.phase = 'running';
			state.startedAt = ctx.now;
			state.endsAt = ctx.now + state.durationMs;
			state.questionIds = game.questions.map((q) => q.id);
			state.attempts = {};
			return;
		}
		case 'extend': {
			if (!isAccepting(state, ctx.now) || state.endsAt === null) {
				throw new CommandError('開催中のコンテストがありません');
			}
			state.endsAt += command.minutes * 60_000;
			return;
		}
		case 'finish': {
			if (state.phase !== 'running') {
				throw new CommandError('開催中のコンテストがありません');
			}
			state.phase = 'finished';
			state.finishedAt = Math.min(ctx.now, state.endsAt ?? ctx.now);
			return;
		}
		case 'openHint': {
			const {attempt} = attemptFor(game, command, ctx);
			if (attempt.hints[command.kind] !== undefined) {
				// 同じヒントを2回開けても何もしない
				return;
			}
			attempt.hints[command.kind] = ctx.now;
			return;
		}
		case 'answer': {
			const {attempt, question} = attemptFor(game, command, ctx);
			const extra = question.extra as unknown as PalindromeQuestionExtra;
			const {correct, normalized} = checkAnswer(command.text, {
				answer: question.answer,
				altAnswers: extra.altAnswers,
				wrongAnswers: attempt.wrong.map((w) => w.text),
			});
			if (correct) {
				attempt.correctAt = ctx.now;
			} else {
				attempt.wrong.push({text: normalized, at: ctx.now});
			}
			return;
		}
	}
};

/** 司会者以外に見せる問題。答えを公開するまでは答え・表記・別解と、自分が開けていないヒントを消す */
const projectQuestion = (
	question: Question,
	game: G,
	viewer: Viewer,
	revealed: boolean,
): Question => {
	const extra = question.extra as unknown as PalindromeQuestionExtra;
	const charCount = [...question.answer].length;
	const allHints = {
		situation: extra.hints.situation,
		irasutoya: extra.hints.irasutoya,
		charTypes: getCharTypesHint(extra.notation, extra.hints.charTypes),
	};

	if (revealed) {
		return {
			...question,
			note: '',
			extra: {
				image: extra.image,
				notation: extra.notation,
				altAnswers: extra.altAnswers ?? [],
				charCount,
				hints: allHints,
			},
		};
	}

	const opened =
		viewer.role === 'participant'
			? (game.state.attempts[question.id]?.[viewer.participantId]?.hints ?? {})
			: {};
	const hints = Object.fromEntries(
		HINT_KINDS.filter((kind) => opened[kind] !== undefined).map((kind) => [kind, allHints[kind]]),
	);
	return {
		...question,
		answer: '',
		note: '',
		extra: {image: extra.image, charCount, hints},
	};
};

export const palindrome: ModeDefinition<PalindromeState, PalindromeCommand> = {
	id: 'palindrome',
	name: 'イラスト回文クイズ',
	questionExtraSchema: palindromeQuestionExtraSchema as unknown as ModeDefinition<
		PalindromeState,
		PalindromeCommand
	>['questionExtraSchema'],
	commandSchema: palindromeCommandSchema,
	permissions: {
		setDuration: ['host'],
		start: ['host'],
		extend: ['host'],
		finish: ['host'],
		openHint: ['participant'],
		answer: ['participant'],
	},
	initialState: () => ({
		phase: 'waiting',
		durationMs: DEFAULT_DURATION_MS,
		startedAt: null,
		endsAt: null,
		finishedAt: null,
		questionIds: [],
		attempts: {},
	}),
	apply,
	project(game, viewer) {
		if (viewer.role === 'host') {
			return game;
		}

		// 開始前は問題を送らない。開始後は開催中の問題だけを送る
		const revealed = isRevealed(game);
		const questions = contestQuestions(game).map((q) => projectQuestion(q, game, viewer, revealed));

		// 他人の誤答の本文は送らない
		const attempts: PalindromeState['attempts'] = {};
		for (const [questionId, byParticipant] of Object.entries(game.state.attempts)) {
			attempts[questionId] = Object.fromEntries(
				Object.entries(byParticipant).map(([pid, attempt]) => {
					const isSelf = viewer.role === 'participant' && viewer.participantId === pid;
					return [
						pid,
						isSelf
							? attempt
							: {...attempt, wrong: attempt.wrong.map((w) => ({text: '', at: w.at}))},
					];
				}),
			);
		}

		return {
			...game,
			state: {...game.state, attempts},
			questions,
		};
	},
	describe(command, game) {
		// 参加者本人のコマンドは participantId を持たない (取り消しの表示で名前が補われる)
		const who = (id: string | undefined) =>
			id ? `${game.participants.find((p) => p.id === id)?.name ?? '?'}さんが` : '';
		const label = (questionId: string) => {
			const index = game.state.questionIds.indexOf(questionId);
			return index >= 0 ? `問題 ${questionLabel(index)}` : '問題';
		};
		switch (command.type) {
			case 'setDuration':
				return `制限時間を ${command.minutes} 分に変更`;
			case 'start':
				return 'コンテストを開始';
			case 'extend':
				return `${command.minutes} 分延長`;
			case 'finish':
				return 'コンテストを終了';
			case 'openHint':
				return `${who(command.participantId)}${label(command.questionId)} の${HINT_NAMES[command.kind]}ヒントを開けた`;
			case 'answer':
				return `${who(command.participantId)}${label(command.questionId)} に回答`;
		}
	},
	askedQuestionIds(game) {
		return new Set(game.state.questionIds);
	},
	reviewItems(game) {
		return game.state.questionIds.map((questionId, recordIndex) => ({questionId, recordIndex}));
	},
};
