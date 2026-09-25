import {projectGame} from '../../../shared/engine.ts';
import type {
	PalindromeAttempt,
	PalindromeQuestionExtra,
	PalindromeState,
} from '../../../shared/modes/palindrome/index.ts';
import type {Game, GameView, Participant, Question, Viewer} from '../../../shared/types.ts';

/** 画面のテストとスクリーンショットで使うゲームの状態 */

const MIN = 60_000;

const question = (
	id: string,
	answer: string,
	notation: string,
	situation: string,
	irasutoya: string,
): Question => ({
	id,
	text: '',
	answer,
	note: '',
	extra: {
		image: `media-${id}`,
		notation,
		altAnswers: [],
		hints: {situation, irasutoya},
	} satisfies PalindromeQuestionExtra,
});

export const fixtureQuestions: Question[] = [
	question(
		'q1',
		'まくらからくま',
		'枕から熊',
		'寝具から動物が出てきています',
		'「枕のイラスト」「熊のキャラクター」',
	),
	question('q2', 'とまと', 'トマト', '赤い野菜です', '「トマトのイラスト」'),
	question('q3', 'たいいた', '鯛板', '魚が板の上にいます', '「鯛のイラスト」「まな板のイラスト」'),
	question('q4', 'しんぶんし', '新聞紙', '読み終わった紙です', '「新聞のイラスト」'),
	question(
		'q5',
		'たけやぶやけた',
		'竹藪焼けた',
		'植物が燃えています',
		'「竹林のイラスト」「火事」',
	),
];

const NAMES = ['太郎', 'Claude', '花子', '次郎', '三郎', '四郎', '五郎', '六子', '七海', '八尋'];

const attempt = (partial: Partial<PalindromeAttempt>): PalindromeAttempt => ({
	hints: {},
	wrong: [],
	correctAt: null,
	...partial,
});

export interface FixtureOptions {
	phase?: PalindromeState['phase'];
	/** 参加者の人数 (3 人以上) */
	participantCount?: number;
	/** 基準の時刻。開始は 10 分前、終了予定は 20 分後になる */
	now?: number;
	review?: Game['review'];
}

export const createFixtureGame = ({
	phase = 'running',
	participantCount = 3,
	now = Date.now(),
	review = null,
}: FixtureOptions = {}): Game<PalindromeState> => {
	const startedAt = now - 10 * MIN;
	const participants: Participant[] = Array.from({length: participantCount}, (_, i) => ({
		id: `p${i + 1}`,
		name: NAMES[i] ?? `参加者${i + 1}`,
		joinedAt: 0,
		kind: i === 1 ? 'ai' : 'human',
	}));

	const attempts: PalindromeState['attempts'] = {
		q1: {
			p1: attempt({
				hints: {situation: startedAt + MIN},
				wrong: [{text: 'まくらのらくま', at: startedAt + 2 * MIN}],
			}),
			p2: attempt({
				hints: {charTypes: startedAt + MIN, irasutoya: startedAt + 2 * MIN},
				correctAt: startedAt + 3 * MIN,
			}),
		},
		q2: {
			p1: attempt({correctAt: startedAt + 5 * MIN}),
			p3: attempt({wrong: [{text: 'たまた', at: startedAt + MIN}], correctAt: startedAt + 4 * MIN}),
		},
		q3: {
			p3: attempt({wrong: [{text: 'かいいか', at: startedAt + 6 * MIN}]}),
		},
	};
	// 4 人目以降は、人によって解けた問題の数と時間をずらす
	for (let i = 3; i < participantCount; i++) {
		const id = `p${i + 1}`;
		fixtureQuestions.slice(0, i % 5).forEach((q, j) => {
			attempts[q.id] ??= {};
			const byParticipant = attempts[q.id] ?? {};
			byParticipant[id] = attempt({
				hints: j % 2 === 0 ? {charTypes: startedAt} : {},
				wrong: i % 3 === 0 ? [{text: 'かいか', at: startedAt}] : [],
				correctAt: startedAt + (i + j) * 20_000,
			});
		});
	}

	const state: PalindromeState =
		phase === 'waiting'
			? {
					phase,
					durationMs: 30 * MIN,
					startedAt: null,
					endsAt: null,
					finishedAt: null,
					questionIds: [],
					attempts: {},
				}
			: {
					phase,
					durationMs: 30 * MIN,
					startedAt,
					endsAt: startedAt + 30 * MIN,
					finishedAt: phase === 'finished' ? now : null,
					questionIds: fixtureQuestions.map((q) => q.id),
					attempts,
				};

	return {
		id: 'g1',
		mode: 'palindrome',
		title: '回文クイズ大会',
		createdAt: 0,
		review,
		participants,
		questions: structuredClone(fixtureQuestions),
		state,
	};
};

/** 閲覧者ごとに投影したビュー (サーバーから届くものと同じ) */
export const createFixtureView = (
	viewer: Viewer,
	options: FixtureOptions = {},
): GameView<PalindromeState> => {
	const game = createFixtureGame(options);
	return {
		version: 1,
		online: game.participants.map((p) => p.id),
		questionCount: game.questions.length,
		undoable: null,
		game: projectGame(game, viewer) as Game<PalindromeState>,
	};
};

export const fixtureProps = {
	connected: true,
	error: null,
	send: async () => {},
	undo: async () => '',
};
