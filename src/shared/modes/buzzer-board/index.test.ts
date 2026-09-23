import {describe, expect, it} from 'vitest';
import {applyCommand, createGame} from '../../engine.ts';
import type {Actor, Game, Question} from '../../types.ts';
import {type BuzzerBoardState, buzzerBoard, GENRES} from './index.ts';

const host: Actor = {role: 'host'};
const p1: Actor = {role: 'participant', participantId: 'p1'};
const p2: Actor = {role: 'participant', participantId: 'p2'};

const exec = (
	game: Game<BuzzerBoardState>,
	command: unknown,
	actor: Actor = host,
	now = 1000,
): Game<BuzzerBoardState> => applyCommand(game, command, {now, actor}) as Game<BuzzerBoardState>;

const createSampleGame = (
	participantsCount = 3,
	questionCountPerGenre = 2,
): Game<BuzzerBoardState> => {
	let game = createGame({
		id: 'test',
		mode: 'buzzer-board',
		title: 'テスト',
		createdAt: 0,
	}) as Game<BuzzerBoardState>;
	const participants = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].slice(0, participantsCount);
	for (const pid of participants) {
		game = exec(
			game,
			{type: 'participants.join', participantId: pid, name: pid},
			{role: 'system'},
			0,
		);
	}
	const questions: Question[] = [];
	let idCounter = 1;
	for (const genre of GENRES) {
		for (let i = 0; i < questionCountPerGenre; i++) {
			questions.push({
				id: `q${idCounter++}`,
				text: `${genre}の問題${i + 1}`,
				answer: `${genre}の答え${i + 1}`,
				note: '',
				extra: {genre},
			});
		}
	}
	game = exec(
		game,
		{
			type: 'questions.import',
			replace: false,
			questions,
		},
		host,
		0,
	);
	return game;
};

describe('buzzer-board mode', () => {
	it('回答権は最初の1人だけ (2人目以降は回答権を得ず、判定時にvoidになる)', () => {
		let game = createSampleGame(3);
		// 1問目出題
		game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
		expect(game.state.phase).toBe('reading');

		// p1 が押す
		game = exec(game, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		expect(game.state.phase).toBe('answering');
		expect(game.state.history[0]?.buzzes[0]).toMatchObject({
			participantId: 'p1',
			status: 'answering',
		});

		// p2 が遅れて押す
		game = exec(game, {type: 'buzz', pressedAt: 1200}, p2, 1250);
		expect(game.state.phase).toBe('answering');
		expect(game.state.history[0]?.buzzes[1]).toMatchObject({
			participantId: 'p2',
			status: 'waiting',
		});

		// p1 が正解判定
		game = exec(game, {type: 'judge', correct: true}, host, 2000);
		expect(game.state.phase).toBe('closed');
		// p1 は correct、p2 は void になる
		expect(game.state.history[0]?.buzzes[0]?.status).toBe('correct');
		expect(game.state.history[0]?.buzzes[1]?.status).toBe('void');
	});

	it('誤答の休み数: 参加者が5人未満のときと5人以上のとき', () => {
		// 3人の場合: min(3, 5) = 3問休み
		let game3 = createSampleGame(3);
		game3 = exec(game3, {type: 'next', questionId: 'q1'}, host, 1000);
		game3 = exec(game3, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		game3 = exec(game3, {type: 'judge', correct: false}, host, 2000);
		expect(game3.state.rest.p1).toBe(3);

		// 6人の場合: min(6, 5) = 5問休み
		let game6 = createSampleGame(6);
		game6 = exec(game6, {type: 'next', questionId: 'q1'}, host, 1000);
		game6 = exec(game6, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		game6 = exec(game6, {type: 'judge', correct: false}, host, 2000);
		expect(game6.state.rest.p1).toBe(5);

		// 6人のうち2人が勝ち抜けている場合: 早押し参加者数は 6 - 2 = 4人 -> min(4, 5) = 4問休み
		game6.state.cleared.p5 = true;
		game6.state.cleared.p6 = true;
		game6 = exec(game6, {type: 'next', questionId: 'q2'}, host, 3000);
		game6 = exec(game6, {type: 'buzz', pressedAt: 3100}, p2, 3150);
		game6 = exec(game6, {type: 'judge', correct: false}, host, 4000);
		expect(game6.state.rest.p2).toBe(4);
	});

	it('休みの消化 (以後の問題の出題・終了によって減り、スルーでも減る)', () => {
		let game = createSampleGame(3);
		// Q1: p1 が誤答 -> 3問休み
		game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
		game = exec(game, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		game = exec(game, {type: 'judge', correct: false}, host, 2000);
		expect(game.state.rest.p1).toBe(3);

		// 休み中の p1 はボタンを押せない
		game = exec(game, {type: 'next', questionId: 'q2'}, host, 3000);
		expect(() => exec(game, {type: 'buzz', pressedAt: 3100}, p1, 3150)).toThrow('休み中');

		// Q2: p2 が正解 -> p1 の休みが 1 減って 2 になる
		game = exec(game, {type: 'buzz', pressedAt: 3200}, p2, 3250);
		game = exec(game, {type: 'judge', correct: true}, host, 4000);
		expect(game.state.rest.p1).toBe(2);

		// Q3: スルー -> p1 の休みがさらに 1 減って 1 になる
		game = exec(game, {type: 'next', questionId: 'q3'}, host, 5000);
		game = exec(game, {type: 'through'}, host, 6000);
		expect(game.state.rest.p1).toBe(1);

		// Q4: p2 が正解 -> p1 の休みが 0 になる
		game = exec(game, {type: 'next', questionId: 'q4'}, host, 7000);
		game = exec(game, {type: 'buzz', pressedAt: 7100}, p2, 7150);
		game = exec(game, {type: 'judge', correct: true}, host, 8000);
		expect(game.state.rest.p1).toBe(0);

		// Q5: p1 は休みが明けたのでボタンを押せる
		game = exec(game, {type: 'next', questionId: 'q5'}, host, 9000);
		expect(() => exec(game, {type: 'buzz', pressedAt: 9100}, p1, 9150)).not.toThrow();
	});

	it('5 ポイントでの勝ち抜けと上限 (5 を超えたら 5 に戻す)', () => {
		let game = createSampleGame(3);
		// p1 に 4 ポイントを設定
		game = exec(game, {type: 'setScore', participantId: 'p1', score: 4}, host, 0);
		// 連答を設定 (次正解すると +2 ポイント)
		game = exec(game, {type: 'setStreak', participantId: 'p1', count: 1}, host, 0);

		// 出題して p1 が正解
		game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
		game = exec(game, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		game = exec(game, {type: 'judge', correct: true}, host, 2000);

		// 4 + 2 = 6 だが上限 5 に戻される
		expect(game.state.scores.p1).toBe(5);
		expect(game.state.cleared.p1).toBe(true);

		// 勝ち抜けた p1 は次の問題で早押しできない
		game = exec(game, {type: 'next', questionId: 'q2'}, host, 3000);
		expect(() => exec(game, {type: 'buzz', pressedAt: 3100}, p1, 3150)).toThrow('勝ち抜けている');
	});

	it('連答ボーナス (1 -> 2 -> 2)', () => {
		let game = createSampleGame(3);

		// 1問目: p1 正解 (+1, 計1点)
		game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
		game = exec(game, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		game = exec(game, {type: 'judge', correct: true}, host, 2000);
		expect(game.state.scores.p1).toBe(1);
		expect(game.state.streak).toEqual({participantId: 'p1', count: 1});

		// 2問目: p1 連続正解 (+2, 計3点)
		game = exec(game, {type: 'next', questionId: 'q2'}, host, 3000);
		game = exec(game, {type: 'buzz', pressedAt: 3100}, p1, 3150);
		game = exec(game, {type: 'judge', correct: true}, host, 4000);
		expect(game.state.scores.p1).toBe(3);
		expect(game.state.streak).toEqual({participantId: 'p1', count: 2});

		// 3問目: p1 3連続正解 (+2, 計5点、勝ち抜け)
		game = exec(game, {type: 'next', questionId: 'q3'}, host, 5000);
		game = exec(game, {type: 'buzz', pressedAt: 5100}, p1, 5150);
		game = exec(game, {type: 'judge', correct: true}, host, 6000);
		expect(game.state.scores.p1).toBe(5);
		expect(game.state.cleared.p1).toBe(true);
	});

	it('連答が途切れる条件 (他の人の正解、誤答、スルー、出題取り消し)', () => {
		let game = createSampleGame(3);
		// p1 正解で連答1
		game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
		game = exec(game, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		game = exec(game, {type: 'judge', correct: true}, host, 2000);
		expect(game.state.streak?.participantId).toBe('p1');

		// 次で p2 が正解すると連答は p2 に移る
		game = exec(game, {type: 'next', questionId: 'q2'}, host, 3000);
		game = exec(game, {type: 'buzz', pressedAt: 3100}, p2, 3150);
		game = exec(game, {type: 'judge', correct: true}, host, 4000);
		expect(game.state.streak?.participantId).toBe('p2');

		// 次で誤答すると連答は途切れる
		game = exec(game, {type: 'next', questionId: 'q3'}, host, 5000);
		game = exec(game, {type: 'buzz', pressedAt: 5100}, p2, 5150);
		game = exec(game, {type: 'judge', correct: false}, host, 6000);
		expect(game.state.streak).toBeNull();

		// p1 が正解して連答1
		game = exec(game, {type: 'next', questionId: 'q4'}, host, 7000);
		game = exec(game, {type: 'buzz', pressedAt: 7100}, p1, 7150);
		game = exec(game, {type: 'judge', correct: true}, host, 8000);
		expect(game.state.streak?.participantId).toBe('p1');

		// スルーすると連答は途切れる
		game = exec(game, {type: 'next', questionId: 'q5'}, host, 9000);
		game = exec(game, {type: 'through'}, host, 10000);
		expect(game.state.streak).toBeNull();
	});

	it('ジャンルの自動選択と手動選択', () => {
		let game = createSampleGame(3, 1); // 各ジャンル1問ずつ
		// 科学の問題を追加して、科学を2問にする
		game = exec(
			game,
			{
				type: 'questions.add',
				question: {id: 'sci_extra', text: '科学問2', answer: '科学解2', extra: {genre: '科学'}},
			},
			host,
			0,
		);

		// 最も未出題数が多い「科学」が選ばれる
		expect(buzzerBoard.apply).toBeDefined();
		game = exec(game, {type: 'next'}, host, 1000);
		expect(game.state.history[0]?.genre).toBe('科学');

		// p1 が正解 -> p1 がジャンル選択権限を持つ
		game = exec(game, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		game = exec(game, {type: 'judge', correct: true}, host, 2000);
		expect(game.state.genreChooser).toBe('p1');

		// p2 が選ぼうとするとエラー
		expect(() => exec(game, {type: 'chooseGenre', genre: 'スポーツ'}, p2, 2100)).toThrow(
			'権限がありません',
		);

		// p1 が「スポーツ」を選択
		game = exec(game, {type: 'chooseGenre', genre: 'スポーツ'}, p1, 2200);
		expect(game.state.nextGenre).toEqual({genre: 'スポーツ', chosenBy: 'p1'});
		expect(game.state.genreChooser).toBeNull();

		// 出題すると「スポーツ」の問題が出る
		game = exec(game, {type: 'next'}, host, 3000);
		expect(game.state.history[1]?.genre).toBe('スポーツ');
	});

	it('正解者が勝ち抜けた場合 (5ポイント) もジャンルを選べる', () => {
		let game = createSampleGame(3);
		game = exec(game, {type: 'setScore', participantId: 'p1', score: 4}, host, 0);
		game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
		game = exec(game, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		game = exec(game, {type: 'judge', correct: true}, host, 2000);

		expect(game.state.cleared.p1).toBe(true);
		expect(game.state.genreChooser).toBe('p1');

		// p1 がジャンルを選べる
		game = exec(game, {type: 'chooseGenre', genre: '世界史'}, p1, 2100);
		expect(game.state.nextGenre.genre).toBe('世界史');
	});

	it('同じシードなら同じ問題が選ばれること', () => {
		const game1 = createSampleGame(3, 5); // ノンジャンルが5問ある
		const game2 = createSampleGame(3, 5);

		// 同じ seed=42 で出題
		const res1 = exec(game1, {type: 'next', seed: 42}, host, 1000);
		const res2 = exec(game2, {type: 'next', seed: 42}, host, 1000);
		expect(res1.state.history[0]?.questionId).toBe(res2.state.history[0]?.questionId);

		// 別の seed=100 で出題した場合は別の問題になり得る
		const res3 = exec(game1, {type: 'next', seed: 43}, host, 1000);
		expect(res3.state.history[0]?.questionId).not.toBe(res1.state.history[0]?.questionId);
	});

	it('取り消し (イベントログの再生) で同じ状態に戻ること', () => {
		const initial = createSampleGame(3);
		const commands: {cmd: unknown; actor: Actor; now: number}[] = [
			{cmd: {type: 'next', questionId: 'q1'}, actor: host, now: 1000},
			{cmd: {type: 'buzz', pressedAt: 1100}, actor: p1, now: 1150},
			{cmd: {type: 'judge', correct: false}, actor: host, now: 2000},
			{cmd: {type: 'next', questionId: 'q2'}, actor: host, now: 3000},
			{cmd: {type: 'buzz', pressedAt: 3100}, actor: p2, now: 3150},
			{cmd: {type: 'judge', correct: true}, actor: host, now: 4000},
			{cmd: {type: 'chooseGenre', genre: '科学'}, actor: p2, now: 4100},
		];

		let current = initial;
		for (const {cmd, actor, now} of commands) {
			current = exec(current, cmd, actor, now);
		}

		// 最初から再生
		let replayed = initial;
		for (const {cmd, actor, now} of commands) {
			replayed = exec(replayed, cmd, actor, now);
		}

		expect(replayed.state).toEqual(current.state);
	});

	it('出題取り消し (cancel) で正しく巻き戻ること', () => {
		let game = createSampleGame(3);
		// Q1 出題 -> p1 正解
		game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
		game = exec(game, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		game = exec(game, {type: 'judge', correct: true}, host, 2000);
		expect(game.state.scores.p1).toBe(1);

		// Q2 出題 -> p2 誤答 (3問休み)
		game = exec(game, {type: 'next', questionId: 'q2'}, host, 3000);
		game = exec(game, {type: 'buzz', pressedAt: 3100}, p2, 3150);
		game = exec(game, {type: 'judge', correct: false}, host, 4000);
		expect(game.state.rest.p2).toBe(3);

		// Q2 を cancel (returnToPool: true)
		game = exec(game, {type: 'cancel', returnToPool: true}, host, 4500);
		// p2 の休みが 0 に戻り、history から Q2 が消える
		expect(game.state.rest.p2).toBe(0);
		expect(game.state.history.length).toBe(1);
	});

	it('ジャンルの自動選択で同数のジャンルが複数あるときは定義順で先頭が選ばれる', () => {
		// スポーツと世界史が2問ずつ、他が0問
		let game = createGame({
			id: 'test',
			mode: 'buzzer-board',
			title: 'テスト',
			createdAt: 0,
		}) as Game<BuzzerBoardState>;
		game = exec(
			game,
			{
				type: 'questions.import',
				replace: true,
				questions: [
					{id: 'sp1', text: 'sp1', answer: 'a', extra: {genre: 'スポーツ'}},
					{id: 'sp2', text: 'sp2', answer: 'a', extra: {genre: 'スポーツ'}},
					{id: 'wh1', text: 'wh1', answer: 'a', extra: {genre: '世界史'}},
					{id: 'wh2', text: 'wh2', answer: 'a', extra: {genre: '世界史'}},
				],
			},
			host,
			0,
		);
		// GENRES では スポーツ が 世界史 より先なので、スポーツが選ばれる
		game = exec(game, {type: 'next'}, host, 1000);
		expect(game.state.history[0]?.genre).toBe('スポーツ');
	});

	it('未出題問題がないジャンルは選べない', () => {
		let game = createSampleGame(3, 1);
		// ノンジャンルの問題を1問出題して正解 -> ノンジャンルは残り0問
		game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
		game = exec(game, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		game = exec(game, {type: 'judge', correct: true}, host, 2000);

		// p1 がノンジャンルを選ぼうとするとエラー
		expect(() => exec(game, {type: 'chooseGenre', genre: 'ノンジャンル'}, p1, 2100)).toThrow(
			'未出題の問題がありません',
		);
	});

	it('投影 (project) で参加者・モニターに未出題の答えを送らず、ジャンルごとの未出題数を送る', () => {
		let game = createSampleGame(3, 2);
		// 1問目出題中
		game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);

		const projected = buzzerBoard.project(game, {role: 'participant', participantId: 'p1'});
		// 出題中の問題や未出題の問題は questions から除外されている
		expect(projected.questions.length).toBe(0);
		// しかし unaskedCounts は届いている
		expect(projected.state.unaskedCounts.ノンジャンル).toBe(1); // 2問中1問出題中なので未出題は1
		expect(projected.state.unaskedCounts.スポーツ).toBe(2);

		// 正解して終了
		game = exec(game, {type: 'buzz', pressedAt: 1100}, p1, 1150);
		game = exec(game, {type: 'judge', correct: true}, host, 2000);

		const projectedAfter = buzzerBoard.project(game, {role: 'participant', participantId: 'p1'});
		// 終了した問題は見られる
		expect(projectedAfter.questions.length).toBe(1);
		expect(projectedAfter.questions[0]?.id).toBe('q1');
		expect(projectedAfter.questions[0]?.answer).toBe('ノンジャンルの答え1');
	});

	describe('ボードクイズ (#10)', () => {
		it('スルー時: 勝ち抜け者が0人なら問題終了、1人以上なら board-answering に移行する', () => {
			let game = createSampleGame(3, 2);
			game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
			// 勝ち抜け者がいない状態でスルー
			game = exec(game, {type: 'through'}, host, 2000);
			expect(game.state.phase).toBe('closed');
			expect(game.state.history[0]?.result).toBe('through');
			expect(game.state.history[0]?.board).toBeNull();

			// p1 を勝ち抜け (5点) にする
			game = exec(game, {type: 'setCleared', participantId: 'p1', cleared: true}, host, 2100);
			game = exec(game, {type: 'setScore', participantId: 'p1', score: 5}, host, 2100);

			// 2問目出題
			game = exec(game, {type: 'next', questionId: 'q2'}, host, 3000);
			expect(game.state.phase).toBe('reading');

			// p2 が休み中
			game = exec(game, {type: 'setRest', participantId: 'p2', rest: 2}, host, 3050);

			// スルー
			game = exec(game, {type: 'through'}, host, 4000);
			expect(game.state.phase).toBe('board-answering');
			expect(game.state.history[1]?.result).toBe('through');
			expect(game.state.history[1]?.board).not.toBeNull();
			expect(game.state.history[1]?.board?.answers).toEqual({});
			// 休みが1減る
			expect(game.state.rest.p2).toBe(1);
		});

		it('boardSubmit: 勝ち抜けた人だけが回答を送信でき、上書きもできる', () => {
			let game = createSampleGame(3, 2);
			game = exec(game, {type: 'setCleared', participantId: 'p1', cleared: true}, host, 0);
			game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
			game = exec(game, {type: 'through'}, host, 2000);
			expect(game.state.phase).toBe('board-answering');

			// 勝ち抜けていない p2 が送ると拒否
			expect(() => exec(game, {type: 'boardSubmit', text: '回答'}, p2, 2100)).toThrow(
				'勝ち抜けていないため回答できません',
			);

			// 司会者が送ると権限エラーで拒否
			expect(() => exec(game, {type: 'boardSubmit', text: '回答'}, host, 2100)).toThrow(
				'この操作をする権限がありません',
			);

			// 空文字は拒否
			expect(() => exec(game, {type: 'boardSubmit', text: '   '}, p1, 2100)).toThrow(
				'回答を入力してください',
			);

			// 100文字超は拒否
			expect(() => exec(game, {type: 'boardSubmit', text: 'a'.repeat(101)}, p1, 2100)).toThrow(
				'回答は100文字以内で入力してください',
			);

			// 正常に送信
			game = exec(game, {type: 'boardSubmit', text: '  富士山  '}, p1, 2200);
			expect(game.state.history[0]?.board?.answers.p1).toEqual({
				participantId: 'p1',
				text: '富士山',
				submittedAt: 2200,
				correct: null,
			});

			// 送り直して上書き
			game = exec(game, {type: 'boardSubmit', text: 'エベレスト'}, p1, 2300);
			expect(game.state.history[0]?.board?.answers.p1).toEqual({
				participantId: 'p1',
				text: 'エベレスト',
				submittedAt: 2300,
				correct: null,
			});
		});

		it('締め切り・仮判定・確定・得点の流れと未判定拒否・無回答扱い', () => {
			let game = createSampleGame(3, 2);
			// p1 と p2 が勝ち抜け
			game = exec(game, {type: 'setCleared', participantId: 'p1', cleared: true}, host, 0);
			game = exec(game, {type: 'setCleared', participantId: 'p2', cleared: true}, host, 0);
			game = exec(game, {type: 'setScore', participantId: 'p1', score: 5}, host, 0);
			game = exec(game, {type: 'setScore', participantId: 'p2', score: 5}, host, 0);

			game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
			game = exec(game, {type: 'through'}, host, 2000);

			// p1 だけが回答を送信
			game = exec(game, {type: 'boardSubmit', text: '徳川家康'}, p1, 2100);

			// 締め切り (boardClose)
			game = exec(game, {type: 'boardClose'}, host, 2500);
			expect(game.state.phase).toBe('board-judging');
			expect(game.state.history[0]?.board?.closedAt).toBe(2500);

			// p2 は無回答扱い
			expect(game.state.history[0]?.board?.answers.p2).toEqual({
				participantId: 'p2',
				text: '',
				submittedAt: null,
				correct: false,
			});

			// 締め切り後は回答変更不可
			expect(() => exec(game, {type: 'boardSubmit', text: '織田信長'}, p1, 2600)).toThrow(
				'現在は回答を受け付けていません',
			);

			// p1 が未判定のまま確定しようとすると拒否
			expect(() => exec(game, {type: 'boardConfirm'}, host, 2700)).toThrow(
				'未判定の回答が残っています',
			);

			// 仮判定: p1 を正解に
			game = exec(game, {type: 'boardMark', participantId: 'p1', correct: true}, host, 2800);
			expect(game.state.history[0]?.board?.answers.p1?.correct).toBe(true);

			// 確定 (boardConfirm)
			game = exec(game, {type: 'boardConfirm'}, host, 3000);
			expect(game.state.phase).toBe('closed');
			expect(game.state.history[0]?.board?.confirmedAt).toBe(3000);
			expect(game.state.history[0]?.endedAt).toBe(3000);

			// 得点: p1 は 5 -> 6 (5点上限を超えて+1加算される), p2 は 5のまま
			expect(game.state.scores.p1).toBe(6);
			expect(game.state.scores.p2).toBe(5);

			// 連答ボーナスはなく、連答カウントも null のまま
			expect(game.state.streak).toBeNull();

			// 確定後は判定変更も不可
			expect(() =>
				exec(game, {type: 'boardMark', participantId: 'p1', correct: false}, host, 3100),
			).toThrow('判定中ではありません');
		});

		it('boardReopen: 締め切りを取り消して再開できる', () => {
			let game = createSampleGame(3, 2);
			game = exec(game, {type: 'setCleared', participantId: 'p1', cleared: true}, host, 0);
			game = exec(game, {type: 'setCleared', participantId: 'p2', cleared: true}, host, 0);
			game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
			game = exec(game, {type: 'through'}, host, 2000);

			game = exec(game, {type: 'boardSubmit', text: '回答1'}, p1, 2100);
			game = exec(game, {type: 'boardClose'}, host, 2200);
			expect(game.state.phase).toBe('board-judging');
			expect(game.state.history[0]?.board?.answers.p2).toBeDefined();

			// 司会者が再開 (boardReopen)
			game = exec(game, {type: 'boardReopen'}, host, 2300);
			expect(game.state.phase).toBe('board-answering');
			expect(game.state.history[0]?.board?.closedAt).toBeNull();
			// 自動生成された無回答エントリは削除されている
			expect(game.state.history[0]?.board?.answers.p2).toBeUndefined();
			// p1 の回答は保持されている
			expect(game.state.history[0]?.board?.answers.p1?.text).toBe('回答1');

			// p2 も回答を送信できる
			game = exec(game, {type: 'boardSubmit', text: '回答2'}, p2, 2400);
			expect(game.state.history[0]?.board?.answers.p2?.text).toBe('回答2');
		});

		it('投影 (project): 確定前はモニターと他人に回答本文・判定を隠蔽し、確定後は全員に開示する', () => {
			let game = createSampleGame(3, 2);
			game = exec(game, {type: 'setCleared', participantId: 'p1', cleared: true}, host, 0);
			game = exec(game, {type: 'setCleared', participantId: 'p2', cleared: true}, host, 0);
			game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
			game = exec(game, {type: 'through'}, host, 2000);

			game = exec(game, {type: 'boardSubmit', text: '秘密の回答1'}, p1, 2100);
			game = exec(game, {type: 'boardSubmit', text: '秘密の回答2'}, p2, 2200);
			game = exec(game, {type: 'boardClose'}, host, 2300);
			game = exec(game, {type: 'boardMark', participantId: 'p1', correct: true}, host, 2400);
			game = exec(game, {type: 'boardMark', participantId: 'p2', correct: false}, host, 2400);

			// 確定前の投影
			// 1. モニター
			const monitorProj = buzzerBoard.project(game, {role: 'monitor'});
			const mAns = monitorProj.state.history[0]?.board?.answers;
			expect(mAns?.p1?.text).toBe('');
			expect(mAns?.p1?.correct).toBeNull();
			expect(mAns?.p1?.submittedAt).toBe(2100);
			expect(mAns?.p2?.text).toBe('');
			expect(mAns?.p2?.correct).toBeNull();
			// 問題の答えも隠蔽されている
			expect(monitorProj.questions.length).toBe(0);

			// 2. p1 (本人)
			const p1Proj = buzzerBoard.project(game, {role: 'participant', participantId: 'p1'});
			const p1Ans = p1Proj.state.history[0]?.board?.answers;
			// 自分の回答は見え、判定は確定前は見えない
			expect(p1Ans?.p1?.text).toBe('秘密の回答1');
			expect(p1Ans?.p1?.correct).toBeNull();
			// 他人の回答は見えず、判定も見えない
			expect(p1Ans?.p2?.text).toBe('');
			expect(p1Ans?.p2?.correct).toBeNull();
			expect(p1Ans?.p2?.submittedAt).toBe(2200);

			// 3. 司会者 (host)
			const hostProj = buzzerBoard.project(game, {role: 'host'});
			const hAns = hostProj.state.history[0]?.board?.answers;
			expect(hAns?.p1?.text).toBe('秘密の回答1');
			expect(hAns?.p1?.correct).toBe(true);
			expect(hAns?.p2?.text).toBe('秘密の回答2');
			expect(hAns?.p2?.correct).toBe(false);

			// 確定
			game = exec(game, {type: 'boardConfirm'}, host, 2500);

			// 確定後の投影
			const monitorProjAfter = buzzerBoard.project(game, {role: 'monitor'});
			const mAnsAfter = monitorProjAfter.state.history[0]?.board?.answers;
			expect(mAnsAfter?.p1?.text).toBe('秘密の回答1');
			expect(mAnsAfter?.p1?.correct).toBe(true);
			expect(mAnsAfter?.p2?.text).toBe('秘密の回答2');
			expect(mAnsAfter?.p2?.correct).toBe(false);
			// 問題の答えも開示される
			expect(monitorProjAfter.questions.length).toBe(1);
			expect(monitorProjAfter.questions[0]?.answer).toBe('ノンジャンルの答え1');
		});

		it('取り消し (cancel コマンド) で問題開始前の得点・状態に完全に戻る', () => {
			let game = createSampleGame(3, 2);
			game = exec(game, {type: 'setCleared', participantId: 'p1', cleared: true}, host, 0);
			game = exec(game, {type: 'setScore', participantId: 'p1', score: 5}, host, 0);

			game = exec(game, {type: 'next', questionId: 'q1'}, host, 1000);
			game = exec(game, {type: 'through'}, host, 2000);
			game = exec(game, {type: 'boardSubmit', text: '正解'}, p1, 2100);
			game = exec(game, {type: 'boardClose'}, host, 2200);
			game = exec(game, {type: 'boardMark', participantId: 'p1', correct: true}, host, 2300);
			game = exec(game, {type: 'boardConfirm'}, host, 2400);

			// p1 の得点が 6 になっている
			expect(game.state.scores.p1).toBe(6);

			// 出題を取り消して未出題に戻す
			game = exec(game, {type: 'cancel', returnToPool: true}, host, 2500);
			expect(game.state.scores.p1).toBe(5);
			expect(game.state.history.length).toBe(0);
			expect(game.state.phase).toBe('waiting');
		});
	});
});
