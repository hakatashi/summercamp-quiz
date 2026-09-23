import {
	type CommonCommand,
	commonCommandSchema,
	commonPermissions,
	isCommonCommandType,
} from './commands.ts';
import {getMode} from './modes/registry.ts';
import type {AnyModeDefinition, ModeCommand} from './modes/types.ts';
import {
	type Actor,
	type CommandContext,
	CommandError,
	type Game,
	type ModeId,
	type Question,
	type Role,
	type Viewer,
} from './types.ts';

export const createGame = (params: {
	id: string;
	mode: ModeId;
	title: string;
	createdAt: number;
}): Game => ({
	...params,
	questions: [],
	participants: [],
	state: getMode(params.mode).initialState(),
	review: null,
});

const canExecute = (roles: readonly Role[], actor: Actor) =>
	actor.role === 'system' || roles.includes(actor.role);

/**
 * 生のコマンドを検証する。共通コマンドなら共通スキーマで、そうでなければ企画のスキーマで検証し、
 * actor が実行してよいかを確認する。
 */
export const parseCommand = (
	mode: AnyModeDefinition,
	raw: unknown,
	actor: Actor,
): {kind: 'common'; command: CommonCommand} | {kind: 'mode'; command: ModeCommand} => {
	const type =
		typeof raw === 'object' && raw !== null && 'type' in raw && typeof raw.type === 'string'
			? raw.type
			: null;
	if (type === null) {
		throw new CommandError('不正なコマンドです');
	}
	if (isCommonCommandType(type)) {
		const result = commonCommandSchema.safeParse(raw);
		if (!result.success) {
			throw new CommandError(`不正なコマンドです: ${result.error.message}`);
		}
		const roles =
			mode.reviewPermissions && type.startsWith('review.')
				? mode.reviewPermissions
				: commonPermissions[type];
		if (!canExecute(roles, actor)) {
			throw new CommandError('この操作をする権限がありません');
		}
		return {kind: 'common', command: result.data};
	}
	const result = mode.commandSchema.safeParse(raw);
	if (!result.success) {
		throw new CommandError(`不正なコマンドです: ${result.error.message}`);
	}
	const roles: readonly Role[] | undefined = mode.permissions[type];
	if (!roles || !canExecute(roles, actor)) {
		throw new CommandError('この操作をする権限がありません');
	}
	return {kind: 'mode', command: result.data};
};

/**
 * 保存・再生する前に、サーバー側で決めるべき値 (問題 ID) を埋める。
 * 再生 (replay) で同じ結果になるよう、ID はコマンド自体に書き込んでから保存する。
 */
export const fillCommandIds = <C extends CommonCommand | ModeCommand>(
	command: C,
	generateId: () => string,
	generateSeed: () => number = () => Math.floor(Math.random() * 0x7fffffff),
): C => {
	if (command.type === 'questions.add') {
		const c = command as Extract<CommonCommand, {type: 'questions.add'}>;
		return {...c, question: {...c.question, id: c.question.id ?? generateId()}} as C;
	}
	if (command.type === 'questions.import') {
		const c = command as Extract<CommonCommand, {type: 'questions.import'}>;
		return {
			...c,
			questions: c.questions.map((q) => ({...q, id: q.id ?? generateId()})),
		} as C;
	}
	if (
		command.type === 'next' &&
		(command as unknown as Record<string, unknown>).seed === undefined
	) {
		return {...command, seed: generateSeed()} as C;
	}
	return command;
};

const toQuestion = (
	mode: AnyModeDefinition,
	input: {id?: string | undefined; text: string; answer: string; note?: string; extra?: unknown},
): Question => {
	if (input.id === undefined) {
		throw new CommandError('問題 ID がありません');
	}
	const extra = mode.questionExtraSchema.safeParse(input.extra ?? {});
	if (!extra.success) {
		throw new CommandError(`問題の追加情報が不正です: ${extra.error.message}`);
	}
	return {
		id: input.id,
		text: input.text,
		answer: input.answer,
		note: input.note ?? '',
		extra: extra.data,
	};
};

const findQuestionIndex = (game: Game, id: string) => {
	const index = game.questions.findIndex((q) => q.id === id);
	if (index === -1) {
		throw new CommandError('問題が見つかりません');
	}
	return index;
};

const applyCommon = (
	mode: AnyModeDefinition,
	game: Game,
	command: CommonCommand,
	ctx: CommandContext,
) => {
	switch (command.type) {
		case 'questions.add': {
			const question = toQuestion(mode, command.question);
			if (game.questions.some((q) => q.id === question.id)) {
				throw new CommandError('同じ ID の問題があります');
			}
			const index = Math.min(command.index ?? game.questions.length, game.questions.length);
			game.questions.splice(index, 0, question);
			return;
		}
		case 'questions.update': {
			const index = findQuestionIndex(game, command.id);
			const current = game.questions[index] as Question;
			game.questions[index] = toQuestion(mode, {
				id: current.id,
				text: command.text ?? current.text,
				answer: command.answer ?? current.answer,
				note: command.note ?? current.note,
				extra: command.extra ?? current.extra,
			});
			return;
		}
		case 'questions.delete': {
			game.questions.splice(findQuestionIndex(game, command.id), 1);
			return;
		}
		case 'questions.move': {
			const [question] = game.questions.splice(findQuestionIndex(game, command.id), 1);
			game.questions.splice(
				Math.min(command.toIndex, game.questions.length),
				0,
				question as Question,
			);
			return;
		}
		case 'questions.import': {
			const imported = command.questions.map((q) => toQuestion(mode, q));
			game.questions = command.replace ? imported : [...game.questions, ...imported];
			return;
		}
		case 'participants.join': {
			if (game.participants.some((p) => p.id === command.participantId)) {
				throw new CommandError('既に参加しています');
			}
			if (game.participants.some((p) => p.name === command.name)) {
				throw new CommandError('同じ名前の参加者がいます');
			}
			game.participants.push({id: command.participantId, name: command.name, joinedAt: ctx.now});
			mode.onParticipantJoined?.(game, command.participantId, ctx);
			return;
		}
		case 'participants.rename': {
			const participant = game.participants.find((p) => p.id === command.participantId);
			if (!participant) {
				throw new CommandError('参加者が見つかりません');
			}
			if (game.participants.some((p) => p.id !== participant.id && p.name === command.name)) {
				throw new CommandError('同じ名前の参加者がいます');
			}
			participant.name = command.name;
			return;
		}
		case 'participants.remove': {
			const index = game.participants.findIndex((p) => p.id === command.participantId);
			if (index === -1) {
				throw new CommandError('参加者が見つかりません');
			}
			game.participants.splice(index, 1);
			mode.onParticipantRemoved?.(game, command.participantId, ctx);
			return;
		}
		case 'game.rename': {
			game.title = command.title;
			return;
		}
		case 'review.start': {
			if (!mode.reviewItems) {
				throw new CommandError('この企画では感想戦を行えません');
			}
			const items = mode.reviewItems(game);
			if (items.length === 0) {
				throw new CommandError('振り返る項目がありません');
			}
			game.review = {index: 0};
			return;
		}
		case 'review.move': {
			if (!mode.reviewItems) {
				throw new CommandError('この企画では感想戦を行えません');
			}
			if (game.review === null) {
				throw new CommandError('感想戦中ではありません');
			}
			const items = mode.reviewItems(game);
			if (items.length === 0) {
				throw new CommandError('振り返る項目がありません');
			}
			const maxIndex = items.length - 1;
			const nextIndex = Math.max(0, Math.min(command.index, maxIndex));
			game.review = {index: nextIndex};
			return;
		}
		case 'review.end': {
			game.review = null;
			return;
		}
	}
};

/**
 * コマンドを検証して適用し、新しい Game を返す。元の game は変更しない。
 * 受け付けられないときは CommandError を投げる。
 */
export const applyCommand = (game: Game, raw: unknown, ctx: CommandContext): Game => {
	const mode = getMode(game.mode);
	const parsed = parseCommand(mode, raw, ctx.actor);
	const draft = structuredClone(game);
	if (parsed.kind === 'common') {
		applyCommon(mode, draft, parsed.command, ctx);
	} else {
		mode.apply(draft, parsed.command, ctx);
	}
	return draft;
};

export const describeCommand = (game: Game, raw: {type: string}): string => {
	const mode = getMode(game.mode);
	if (isCommonCommandType(raw.type)) {
		const command = raw as CommonCommand;
		const name = (id: string) => game.participants.find((p) => p.id === id)?.name ?? '?';
		switch (command.type) {
			case 'participants.rename':
				return `参加者の名前を「${command.name}」に変更`;
			case 'participants.remove':
				return `参加者「${name(command.participantId)}」を削除`;
			case 'game.rename':
				return `ゲーム名を「${command.title}」に変更`;
			case 'review.start':
				return '感想戦を開始';
			case 'review.move':
				return `感想戦を移動 (${command.index + 1}問目)`;
			case 'review.end':
				return '感想戦を終了';
			default:
				return command.type;
		}
	}
	return mode.describe(raw, game);
};

export const projectGame = (game: Game, viewer: Viewer): Game =>
	getMode(game.mode).project(game, viewer);
