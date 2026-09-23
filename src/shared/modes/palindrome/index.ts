import {
	type Actor,
	type CommandContext,
	CommandError,
	type Game,
	type Question,
} from '../../types.ts';
import type {ModeDefinition} from '../types.ts';
import {generateCharTypes, getCharTypesHint} from './charTypes.ts';
import {
	computeOverallStandings,
	computeQuestionPenalty,
	computeQuestionStandings,
	type PalindromeOverallStanding,
	type PalindromeQuestionStanding,
} from './scoring.ts';
import {
	HINT_NAMES,
	HINT_PENALTIES,
	type HintKind,
	type PalindromeCommand,
	type PalindromePhase,
	type PalindromeQuestionExtra,
	type PalindromeQuestionRecord,
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
	computeOverallStandings,
	computeQuestionPenalty,
	computeQuestionStandings,
	generateCharTypes,
	getAnswerValidationError,
	getCharTypesHint,
	HINT_NAMES,
	HINT_PENALTIES,
	type HintKind,
	isPalindromeRelaxed,
	normalizeAnswerText,
	type PalindromeCommand,
	type PalindromeOverallStanding,
	type PalindromePhase,
	type PalindromeQuestionExtra,
	type PalindromeQuestionRecord,
	type PalindromeQuestionStanding,
	type PalindromeState,
	palindromeCommandSchema,
	palindromeQuestionExtraSchema,
};

type G = Game<PalindromeState>;

export const currentRecord = (state: PalindromeState): PalindromeQuestionRecord | null =>
	state.history.at(-1) ?? null;

export const askedQuestionIds = (state: PalindromeState): Set<string> =>
	new Set(state.history.map((r) => r.questionId));

export const unaskedQuestions = (game: G): Question[] => {
	const asked = askedQuestionIds(game.state);
	return game.questions.filter((q) => !asked.has(q.id));
};

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

const apply = (game: G, command: PalindromeCommand, ctx: CommandContext) => {
	const {state} = game;
	switch (command.type) {
		case 'next': {
			if (state.phase === 'open') {
				const cur = currentRecord(state);
				if (cur && cur.closedAt === null) {
					cur.closedAt = ctx.now;
				}
			}

			const asked = askedQuestionIds(state);
			let question: Question | undefined;
			if (command.questionId !== undefined) {
				question = game.questions.find((q) => q.id === command.questionId);
				if (!question || asked.has(question.id)) {
					throw new CommandError('その問題は出題できません');
				}
			} else {
				question = game.questions.find((q) => !asked.has(q.id));
			}

			if (!question) {
				state.phase = 'finished';
				return;
			}

			state.history.push({
				questionId: question.id,
				openedAt: ctx.now,
				closedAt: null,
				participants: Object.fromEntries(
					game.participants.map((p) => [
						p.id,
						{
							hints: {},
							wrong: [],
							correctAt: null,
						},
					]),
				),
			});
			state.phase = 'open';
			return;
		}
		case 'close': {
			if (state.phase !== 'open') {
				throw new CommandError('出題中の問題がありません');
			}
			const cur = currentRecord(state);
			if (cur) {
				cur.closedAt = ctx.now;
			}
			state.phase = 'closed';
			return;
		}
		case 'finish': {
			if (state.phase === 'open') {
				const cur = currentRecord(state);
				if (cur && cur.closedAt === null) {
					cur.closedAt = ctx.now;
				}
			}
			state.phase = 'finished';
			return;
		}
		case 'showStandings': {
			state.showStandings = command.show;
			return;
		}
		case 'openHint': {
			if (state.phase !== 'open') {
				throw new CommandError('出題中の問題がありません');
			}
			const pid = resolveParticipantId(ctx.actor, command.participantId, game.participants);
			const cur = currentRecord(state);
			if (!cur) {
				throw new CommandError('出題中の問題がありません');
			}
			cur.participants[pid] ??= {hints: {}, wrong: [], correctAt: null};
			const pRec = cur.participants[pid];
			if (!pRec) {
				return;
			}
			if (pRec.correctAt !== null) {
				throw new CommandError('既に正解しています');
			}
			if (pRec.hints[command.kind] !== undefined) {
				// 同じヒントを2回開けても何もしない
				return;
			}
			pRec.hints[command.kind] = ctx.now;
			return;
		}
		case 'answer': {
			if (state.phase !== 'open') {
				throw new CommandError('出題中の問題がありません');
			}
			const pid = resolveParticipantId(ctx.actor, command.participantId, game.participants);
			const cur = currentRecord(state);
			if (!cur) {
				throw new CommandError('出題中の問題がありません');
			}
			cur.participants[pid] ??= {hints: {}, wrong: [], correctAt: null};
			const pRec = cur.participants[pid];
			if (!pRec) {
				return;
			}
			if (pRec.correctAt !== null) {
				throw new CommandError('既に正解しています');
			}

			const question = game.questions.find((q) => q.id === cur.questionId);
			if (!question) {
				throw new CommandError('問題が見つかりません');
			}

			const extra = question.extra as unknown as PalindromeQuestionExtra;
			const wrongAnswers = pRec.wrong.map((w) => w.text);
			const {correct, normalized} = checkAnswer(command.text, {
				answer: question.answer,
				altAnswers: extra.altAnswers,
				wrongAnswers,
			});

			if (correct) {
				pRec.correctAt = ctx.now;
			} else {
				pRec.wrong.push({text: normalized, at: ctx.now});
			}
			return;
		}
	}
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
		next: ['host'],
		close: ['host'],
		finish: ['host'],
		showStandings: ['host'],
		openHint: ['participant'],
		answer: ['participant'],
	},
	initialState: () => ({
		phase: 'waiting',
		history: [],
		showStandings: false,
	}),
	apply,
	onParticipantJoined(game, participantId) {
		const cur = currentRecord(game.state);
		if (cur && cur.closedAt === null) {
			cur.participants[participantId] ??= {hints: {}, wrong: [], correctAt: null};
		}
	},
	project(game, viewer) {
		if (viewer.role === 'host') {
			return game;
		}

		// 司会者以外には未出題の問題は送らない
		const asked = askedQuestionIds(game.state);
		const cur = currentRecord(game.state);
		const openQuestionId =
			game.state.phase === 'open' && cur && cur.closedAt === null ? cur.questionId : undefined;

		const projectedQuestions = game.questions
			.filter((q) => asked.has(q.id))
			.map((q) => {
				const extra = q.extra as unknown as PalindromeQuestionExtra;
				const isOpen = q.id === openQuestionId;
				const charCount = [...q.answer].length;

				if (isOpen) {
					// 出題中: 想定解・別解・表記・未開放ヒントは送らない
					let projectedHints: Record<string, string> = {};
					if (viewer.role === 'participant') {
						const pRec = cur?.participants[viewer.participantId];
						const opened = pRec?.hints ?? {};
						projectedHints = {
							...(opened.situation !== undefined ? {situation: extra.hints.situation} : {}),
							...(opened.irasutoya !== undefined ? {irasutoya: extra.hints.irasutoya} : {}),
							...(opened.charTypes !== undefined
								? {charTypes: getCharTypesHint(extra.notation, extra.hints.charTypes)}
								: {}),
						};
					}
					return {
						...q,
						answer: '',
						note: '',
						extra: {
							image: extra.image,
							charCount,
							hints: projectedHints,
						},
					};
				}

				// 終了後: 答えや表記、全ヒントを解禁する
				return {
					...q,
					note: '',
					extra: {
						image: extra.image,
						notation: extra.notation,
						altAnswers: extra.altAnswers ?? [],
						charCount,
						hints: {
							situation: extra.hints.situation,
							irasutoya: extra.hints.irasutoya,
							charTypes: getCharTypesHint(extra.notation, extra.hints.charTypes),
						},
					},
				};
			});

		// 司会者以外には、他人の回答本文 (wrong[].text) は送らない
		const projectedHistory: PalindromeQuestionRecord[] = game.state.history.map((record) => {
			const projectedParticipants: Record<
				string,
				PalindromeQuestionRecord['participants'][string]
			> = {};
			for (const [pid, pRec] of Object.entries(record.participants)) {
				const isSelf = viewer.role === 'participant' && viewer.participantId === pid;
				projectedParticipants[pid] = {
					hints: pRec.hints,
					correctAt: pRec.correctAt,
					wrong: isSelf ? pRec.wrong : pRec.wrong.map((w) => ({text: '', at: w.at})),
				};
			}
			return {
				...record,
				participants: projectedParticipants,
			};
		});

		return {
			...game,
			state: {
				...game.state,
				history: projectedHistory,
			},
			questions: projectedQuestions,
		};
	},
	describe(command, game) {
		const name = (id: string | undefined) =>
			(id ? game.participants.find((p) => p.id === id)?.name : undefined) ?? '?';
		switch (command.type) {
			case 'next':
				return '次の問題へ';
			case 'close':
				return '問題を終了';
			case 'finish':
				return '企画を終了';
			case 'showStandings':
				return command.show ? '総合順位を表示' : '総合順位を非表示';
			case 'openHint': {
				const pName = name(command.participantId);
				const hintName = HINT_NAMES[command.kind];
				return `${pName}さんが${hintName}ヒントを開けた`;
			}
			case 'answer': {
				const pName = name(command.participantId);
				return `${pName}さんの回答`;
			}
		}
	},
	askedQuestionIds(game) {
		return askedQuestionIds(game.state);
	},
};
