import {registerBuzz} from '../../buzz.ts';
import {
	type CommandContext,
	CommandError,
	type Game,
	type Question,
	type ReviewItem,
} from '../../types.ts';
import type {ModeDefinition} from '../types.ts';
import {
	type BoardAnswer,
	type BuzzerBoardCommand,
	type BuzzerBoardQuestionExtra,
	type BuzzerBoardState,
	buzzerBoardCommandSchema,
	GENRES,
	type Genre,
	type QuestionRecord,
	type QuestionResult,
	questionExtraSchema,
	type ScoreBreakdown,
} from './types.ts';

export * from './types.ts';

type G = Game<BuzzerBoardState>;

export const currentRecord = (state: BuzzerBoardState): QuestionRecord | null =>
	state.phase === 'reading' ||
	state.phase === 'answering' ||
	state.phase === 'board-answering' ||
	state.phase === 'board-judging' ||
	state.phase === 'closed'
		? (state.history.at(-1) ?? null)
		: null;

const requireOpenRecord = (state: BuzzerBoardState) => {
	const record = currentRecord(state);
	if (!record || (state.phase !== 'reading' && state.phase !== 'answering')) {
		throw new CommandError('出題中の問題がありません');
	}
	return record;
};

export const askedQuestionIds = (state: BuzzerBoardState) =>
	new Set(state.history.map((r) => r.questionId));

export const unaskedQuestions = (game: G): Question[] => {
	const asked = askedQuestionIds(game.state);
	return game.questions.filter((q) => !asked.has(q.id));
};

export const computeUnaskedCounts = (game: G): Record<Genre, number> => {
	const counts = Object.fromEntries(GENRES.map((g) => [g, 0])) as Record<Genre, number>;
	const unasked = unaskedQuestions(game);
	for (const q of unasked) {
		const genre = (q.extra as BuzzerBoardQuestionExtra)?.genre;
		if (genre && Object.hasOwn(counts, genre)) {
			counts[genre]++;
		}
	}
	return counts;
};

export const computeAutoGenre = (game: G): Genre => {
	const counts = computeUnaskedCounts(game);
	let selected: Genre = GENRES[0];
	let maxCount = -1;
	for (const g of GENRES) {
		const count = counts[g] ?? 0;
		if (count > maxCount) {
			maxCount = count;
			selected = g;
		}
	}
	return selected;
};

export const scoreOf = (state: BuzzerBoardState, participantId: string) =>
	state.scores[participantId] ?? 0;

export const restOf = (state: BuzzerBoardState, participantId: string) =>
	state.rest[participantId] ?? 0;

export const isCleared = (state: BuzzerBoardState, participantId: string) =>
	Boolean(state.cleared[participantId]);

const endQuestion = (
	state: BuzzerBoardState,
	record: QuestionRecord,
	result: QuestionResult,
	now: number,
	breakdown: ScoreBreakdown | null = null,
) => {
	for (const buzz of record.buzzes) {
		if (buzz.status === 'waiting' || buzz.status === 'answering') {
			buzz.status = 'void';
		}
	}
	record.result = result;
	record.endedAt = now;
	record.breakdown = breakdown;
	state.phase = 'closed';
};

const apply = (game: G, command: BuzzerBoardCommand, ctx: CommandContext) => {
	const {state} = game;
	switch (command.type) {
		case 'next': {
			if (
				state.phase === 'reading' ||
				state.phase === 'answering' ||
				state.phase === 'board-answering' ||
				state.phase === 'board-judging'
			) {
				throw new CommandError('出題中の問題を終了してから次に進んでください');
			}
			const unasked = unaskedQuestions(game);
			if (unasked.length === 0) {
				state.phase = 'finished';
				return;
			}
			let question: Question | undefined;
			if (command.questionId !== undefined) {
				question = unasked.find((q) => q.id === command.questionId);
				if (!question) {
					throw new CommandError('その問題は出題できません');
				}
			} else {
				const targetGenre =
					state.nextGenre.chosenBy !== null ? state.nextGenre.genre : computeAutoGenre(game);
				let candidates = unasked.filter(
					(q) => (q.extra as BuzzerBoardQuestionExtra)?.genre === targetGenre,
				);
				if (candidates.length === 0) {
					const autoGenre = computeAutoGenre(game);
					candidates = unasked.filter(
						(q) => (q.extra as BuzzerBoardQuestionExtra)?.genre === autoGenre,
					);
					if (candidates.length === 0) {
						state.phase = 'finished';
						return;
					}
				}
				const seed = command.seed ?? 0;
				const index = ((seed % candidates.length) + candidates.length) % candidates.length;
				question = candidates[index];
			}
			if (!question) {
				state.phase = 'finished';
				return;
			}

			const genre = (question.extra as BuzzerBoardQuestionExtra).genre;
			state.history.push({
				questionId: question.id,
				startedAt: ctx.now,
				endedAt: null,
				genre,
				scoresBefore: {...state.scores},
				restBefore: {...state.rest},
				clearedBefore: {...state.cleared},
				streakBefore: state.streak ? {...state.streak} : null,
				nextGenreBefore: {...state.nextGenre},
				genreChooserBefore: state.genreChooser,
				buzzes: [],
				result: null,
				breakdown: null,
				board: null,
			});
			state.phase = 'reading';
			state.unaskedCounts = computeUnaskedCounts(game);
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
			if (state.cleared[participantId]) {
				throw new CommandError('勝ち抜けているため早押しには参加できません');
			}
			if ((state.rest[participantId] ?? 0) > 0) {
				throw new CommandError('休み中のためボタンを押せません');
			}
			const record = requireOpenRecord(state);
			if (record.buzzes.some((b) => b.participantId === participantId && b.status !== 'void')) {
				throw new CommandError('この問題では既にボタンを押しています');
			}
			const {buzzes} = registerBuzz(record.buzzes, {
				participantId,
				declaredPressedAt: command.pressedAt,
				startedAt: record.startedAt,
				receivedAt: ctx.now,
			});
			record.buzzes = buzzes;
			state.phase = 'answering';
			return;
		}
		case 'judge': {
			const record = requireOpenRecord(state);
			const answering = record.buzzes.find((b) => b.status === 'answering');
			if (!answering) {
				throw new CommandError('回答中の参加者がいません');
			}
			for (const b of record.buzzes) {
				if (b.status === 'waiting') {
					b.status = 'void';
				}
			}
			if (command.correct) {
				answering.status = 'correct';
				const isStreak = state.streak?.participantId === answering.participantId;
				const base = 1;
				const bonus = isStreak ? 1 : 0;
				const currentScore = scoreOf(state, answering.participantId);
				const newScore = Math.min(5, currentScore + base + bonus);
				state.scores[answering.participantId] = newScore;
				if (newScore >= 5) {
					state.cleared[answering.participantId] = true;
				}
				const streakCount = isStreak && state.streak ? state.streak.count + 1 : 1;
				state.streak = {
					participantId: answering.participantId,
					count: streakCount,
				};
				// 休み中の人の休みを消化
				for (const p of game.participants) {
					if (p.id !== answering.participantId && (state.rest[p.id] ?? 0) > 0) {
						state.rest[p.id] = Math.max(0, (state.rest[p.id] ?? 0) - 1);
					}
				}
				// 正解者が勝ち抜けた場合もジャンルを選べる
				state.genreChooser = answering.participantId;
				state.nextGenre = {genre: computeAutoGenre(game), chosenBy: null};
				endQuestion(state, record, 'correct', ctx.now, {base, bonus});
				return;
			}
			// 誤答の場合
			answering.status = 'wrong';
			state.streak = null;
			// 誤答した時点での未勝ち抜け参加者数
			const activeCount = game.participants.filter((p) => !state.cleared[p.id]).length;
			const penalty = Math.min(activeCount, 5);
			state.rest[answering.participantId] = penalty;
			// 他の休み中の人の休みを消化
			for (const p of game.participants) {
				if (p.id !== answering.participantId && (state.rest[p.id] ?? 0) > 0) {
					state.rest[p.id] = Math.max(0, (state.rest[p.id] ?? 0) - 1);
				}
			}
			// 誤答の次は自動選択
			state.genreChooser = null;
			state.nextGenre = {genre: computeAutoGenre(game), chosenBy: null};
			endQuestion(state, record, 'wrong', ctx.now, null);
			return;
		}
		case 'through': {
			const record = requireOpenRecord(state);
			for (const b of record.buzzes) {
				if (b.status === 'waiting' || b.status === 'answering') {
					b.status = 'void';
				}
			}
			state.streak = null;
			for (const p of game.participants) {
				if ((state.rest[p.id] ?? 0) > 0) {
					state.rest[p.id] = Math.max(0, (state.rest[p.id] ?? 0) - 1);
				}
			}
			state.genreChooser = null;
			state.nextGenre = {genre: computeAutoGenre(game), chosenBy: null};

			const clearedParticipants = game.participants.filter((p) => state.cleared[p.id]);
			if (clearedParticipants.length > 0) {
				state.phase = 'board-answering';
				record.result = 'through';
				record.board = {
					answers: {},
					closedAt: null,
					confirmedAt: null,
				};
				return;
			}

			endQuestion(state, record, 'through', ctx.now, null);
			return;
		}
		case 'chooseGenre': {
			const canChoose =
				ctx.actor.role === 'host' ||
				(ctx.actor.role === 'participant' && ctx.actor.participantId === state.genreChooser);
			if (!canChoose) {
				throw new CommandError('ジャンルを選ぶ権限がありません');
			}
			const unaskedCounts = computeUnaskedCounts(game);
			if ((unaskedCounts[command.genre] ?? 0) <= 0) {
				throw new CommandError('そのジャンルには未出題の問題がありません');
			}
			state.nextGenre = {
				genre: command.genre,
				chosenBy: ctx.actor.role === 'participant' ? ctx.actor.participantId : null,
			};
			state.genreChooser = null;
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
			state.scores = {...record.scoresBefore};
			state.rest = {...record.restBefore};
			state.cleared = {...record.clearedBefore};
			state.streak = record.streakBefore ? {...record.streakBefore} : null;
			state.nextGenre = {...record.nextGenreBefore};
			state.genreChooser = record.genreChooserBefore;
			if (command.returnToPool) {
				state.history.pop();
			} else {
				endQuestion(state, record, 'cancelled', ctx.now, null);
			}
			state.phase = state.history.length > 0 ? 'closed' : 'waiting';
			state.unaskedCounts = computeUnaskedCounts(game);
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
		case 'setRest': {
			if (!game.participants.some((p) => p.id === command.participantId)) {
				throw new CommandError('参加者が見つかりません');
			}
			state.rest[command.participantId] = command.rest;
			return;
		}
		case 'setCleared': {
			if (!game.participants.some((p) => p.id === command.participantId)) {
				throw new CommandError('参加者が見つかりません');
			}
			state.cleared[command.participantId] = command.cleared;
			return;
		}
		case 'setStreak': {
			if (command.participantId === null) {
				state.streak = null;
			} else {
				if (!game.participants.some((p) => p.id === command.participantId)) {
					throw new CommandError('参加者が見つかりません');
				}
				state.streak = {participantId: command.participantId, count: command.count};
			}
			return;
		}
		case 'setNextGenre': {
			state.nextGenre = {genre: command.genre, chosenBy: null};
			state.genreChooser = null;
			return;
		}
		case 'boardSubmit': {
			if (ctx.actor.role !== 'participant') {
				throw new CommandError('参加者だけが回答を送信できます');
			}
			const {participantId} = ctx.actor;
			if (!state.cleared[participantId]) {
				throw new CommandError('勝ち抜けていないため回答できません');
			}
			if (state.phase !== 'board-answering') {
				throw new CommandError('現在は回答を受け付けていません');
			}
			const record = currentRecord(state);
			if (!record?.board) {
				throw new CommandError('ボードクイズ中の問題がありません');
			}
			const text = command.text.trim();
			if (text.length === 0) {
				throw new CommandError('回答を入力してください');
			}
			if (text.length > 100) {
				throw new CommandError('回答は100文字以内で入力してください');
			}
			record.board.answers[participantId] = {
				participantId,
				text,
				submittedAt: ctx.now,
				correct: null,
			};
			return;
		}
		case 'boardClose': {
			if (state.phase !== 'board-answering') {
				throw new CommandError('回答受付中ではありません');
			}
			const record = currentRecord(state);
			if (!record?.board) {
				throw new CommandError('ボードクイズ中の問題がありません');
			}
			const clearedParticipants = game.participants.filter((p) => state.cleared[p.id]);
			for (const p of clearedParticipants) {
				if (!record.board.answers[p.id]) {
					record.board.answers[p.id] = {
						participantId: p.id,
						text: '',
						submittedAt: null,
						correct: false,
					};
				}
			}
			record.board.closedAt = ctx.now;
			state.phase = 'board-judging';
			return;
		}
		case 'boardMark': {
			if (state.phase !== 'board-judging') {
				throw new CommandError('判定中ではありません');
			}
			const record = currentRecord(state);
			if (!record?.board) {
				throw new CommandError('ボードクイズ中の問題がありません');
			}
			const answer = record.board.answers[command.participantId];
			if (!answer) {
				throw new CommandError('回答が見つかりません');
			}
			answer.correct = command.correct;
			return;
		}
		case 'boardConfirm': {
			if (state.phase !== 'board-judging') {
				throw new CommandError('判定中ではありません');
			}
			const record = currentRecord(state);
			if (!record?.board) {
				throw new CommandError('ボードクイズ中の問題がありません');
			}
			const clearedParticipants = game.participants.filter((p) => state.cleared[p.id]);
			for (const p of clearedParticipants) {
				const ans = record.board.answers[p.id];
				if (!ans || ans.correct === null) {
					throw new CommandError('未判定の回答が残っています');
				}
			}
			for (const p of clearedParticipants) {
				const ans = record.board.answers[p.id];
				if (ans && ans.correct === true) {
					state.scores[p.id] = (state.scores[p.id] ?? 0) + 1;
				}
			}
			record.board.confirmedAt = ctx.now;
			record.endedAt = ctx.now;
			state.phase = 'closed';
			return;
		}
		case 'boardReopen': {
			if (state.phase !== 'board-judging') {
				throw new CommandError('判定中ではありません');
			}
			const record = currentRecord(state);
			if (!record?.board) {
				throw new CommandError('ボードクイズ中の問題がありません');
			}
			record.board.closedAt = null;
			for (const [id, ans] of Object.entries(record.board.answers)) {
				if (ans.submittedAt === null) {
					delete record.board.answers[id];
				}
			}
			state.phase = 'board-answering';
			return;
		}
	}
};

const resultLabels: Record<QuestionResult, string> = {
	correct: '正解',
	wrong: '誤答',
	through: 'スルー',
	cancelled: '取り消し',
};
export const describeResult = (result: QuestionResult) => resultLabels[result];

export const buzzerBoard: ModeDefinition<BuzzerBoardState, BuzzerBoardCommand> = {
	id: 'buzzer-board',
	name: '早押しクイズ (ボード付き)',
	questionExtraSchema,
	commandSchema: buzzerBoardCommandSchema,
	permissions: {
		next: ['host'],
		buzz: ['participant'],
		judge: ['host'],
		through: ['host'],
		chooseGenre: ['host', 'participant'],
		cancel: ['host'],
		resetBuzzes: ['host'],
		setScore: ['host'],
		setRest: ['host'],
		setCleared: ['host'],
		setStreak: ['host'],
		setNextGenre: ['host'],
		boardSubmit: ['participant'],
		boardClose: ['host'],
		boardMark: ['host'],
		boardConfirm: ['host'],
		boardReopen: ['host'],
	},
	initialState: () => ({
		phase: 'waiting',
		scores: {},
		rest: {},
		cleared: {},
		streak: null,
		nextGenre: {genre: GENRES[0], chosenBy: null},
		genreChooser: null,
		history: [],
		unaskedCounts: Object.fromEntries(GENRES.map((g) => [g, 0])) as Record<Genre, number>,
	}),
	apply,
	onParticipantJoined(game, participantId) {
		game.state.scores[participantId] ??= 0;
		game.state.rest[participantId] ??= 0;
		game.state.cleared[participantId] ??= false;
	},
	onParticipantRemoved(game, participantId) {
		delete game.state.scores[participantId];
		delete game.state.rest[participantId];
		delete game.state.cleared[participantId];
		if (game.state.streak?.participantId === participantId) {
			game.state.streak = null;
		}
		if (game.state.genreChooser === participantId) {
			game.state.genreChooser = null;
		}
		const record = currentRecord(game.state);
		if (record && (game.state.phase === 'reading' || game.state.phase === 'answering')) {
			record.buzzes = record.buzzes.filter((b) => b.participantId !== participantId);
			if (!record.buzzes.some((b) => b.status === 'answering')) {
				game.state.phase = 'reading';
			}
		}
		if (record?.board) {
			delete record.board.answers[participantId];
		}
	},
	project(game, viewer) {
		const unaskedCounts = computeUnaskedCounts(game);
		const stateWithCounts: BuzzerBoardState = {
			...game.state,
			unaskedCounts,
		};
		if (viewer.role === 'host') {
			return {
				...game,
				state: stateWithCounts,
			};
		}
		// 参加者とモニターには、出題中や未出題の問題文・答えを送らない
		const open =
			game.state.phase === 'reading' ||
			game.state.phase === 'answering' ||
			game.state.phase === 'board-answering' ||
			game.state.phase === 'board-judging';
		const openId = open ? game.state.history.at(-1)?.questionId : undefined;
		const visible = new Set(
			game.state.history
				.filter((r) =>
					game.review !== null
						? r.result !== null && r.result !== 'cancelled'
						: r.questionId !== openId,
				)
				.map((r) => r.questionId),
		);

		// ボード回答の投影
		// 確定前: 回答本文と判定は司会者と本人だけに見せる。モニターと他の参加者には「回答済みかどうか」だけを見せる。
		// 確定後: 全員に見せる。
		const projectedHistory = stateWithCounts.history.map((record) => {
			if (!record.board) {
				return record;
			}
			const isConfirmed = record.board.confirmedAt !== null;
			if (isConfirmed) {
				return record;
			}
			const projectedAnswers: Record<string, BoardAnswer> = {};
			for (const [pId, ans] of Object.entries(record.board.answers)) {
				if (viewer.role === 'participant' && viewer.participantId === pId) {
					projectedAnswers[pId] = {
						...ans,
						correct: null,
					};
				} else {
					projectedAnswers[pId] = {
						...ans,
						text: '',
						correct: null,
					};
				}
			}
			return {
				...record,
				board: {
					...record.board,
					answers: projectedAnswers,
				},
			};
		});

		// ボードクイズ中は問題文を読み終えているので、モニターには出題中の問題文だけを見せる (答えは隠す)
		const boardOpenId =
			viewer.role === 'monitor' &&
			game.review === null &&
			(game.state.phase === 'board-answering' || game.state.phase === 'board-judging')
				? openId
				: undefined;

		return {
			...game,
			state: {
				...stateWithCounts,
				history: projectedHistory,
			},
			questions: game.questions.flatMap((q) => {
				if (visible.has(q.id)) {
					return [{...q, note: ''}];
				}
				if (q.id === boardOpenId) {
					return [{...q, answer: '', note: ''}];
				}
				return [];
			}),
		};
	},
	reviewItems(game) {
		const items: ReviewItem[] = [];
		game.state.history.forEach((record, index) => {
			if (record.result !== null && record.result !== 'cancelled') {
				items.push({questionId: record.questionId, recordIndex: index});
			}
		});
		return items;
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
			case 'through':
				return 'スルー (問題終了)';
			case 'chooseGenre':
				return `ジャンル選択 (${command.genre})`;
			case 'cancel':
				return command.returnToPool ? '出題の取り消し (未出題に戻す)' : '出題の取り消し';
			case 'resetBuzzes':
				return 'ボタン押下のリセット';
			case 'setScore':
				return `${name(command.participantId)} の得点を ${command.score} に変更`;
			case 'setRest':
				return `${name(command.participantId)} の休みを ${command.rest} 問に変更`;
			case 'setCleared':
				return `${name(command.participantId)} の勝ち抜けを ${command.cleared ? '有効' : '解除'} に変更`;
			case 'setStreak':
				return '連答数を変更';
			case 'setNextGenre':
				return `次のジャンルを「${command.genre}」に変更`;
			case 'boardSubmit':
				return 'ボード回答送信';
			case 'boardClose':
				return 'ボード回答の締め切り';
			case 'boardMark':
				return `${name(command.participantId)} のボード回答を${
					command.correct === null ? '未判定' : command.correct ? '正解' : '不正解'
				}に仮判定`;
			case 'boardConfirm':
				return 'ボード回答の確定';
			case 'boardReopen':
				return 'ボード回答の再開';
		}
	},
	askedQuestionIds(game) {
		return askedQuestionIds(game.state);
	},
	isBeforeStart(game) {
		return game.state.phase === 'waiting';
	},
};
