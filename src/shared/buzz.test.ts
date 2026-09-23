import {describe, expect, it} from 'vitest';
import {
	adjustPressedAt,
	arrangeBuzzes,
	BUZZ_GRACE_MS,
	type Buzz,
	buzzCommandSchema,
	buzzDiagSchema,
	registerBuzz,
} from './buzz.ts';

describe('buzz schema', () => {
	it('diag スキーマを検証できる', () => {
		const valid = {rtt: 42.5, offset: -12.3};
		expect(buzzDiagSchema.parse(valid)).toEqual(valid);
		expect(() => buzzDiagSchema.parse({rtt: 'invalid'})).toThrow();
	});

	it('buzz コマンドで diag があってもなくてもパースできる', () => {
		const withoutDiag = {type: 'buzz', pressedAt: 1000};
		expect(buzzCommandSchema.parse(withoutDiag)).toEqual(withoutDiag);

		const withDiag = {
			type: 'buzz',
			pressedAt: 1000,
			diag: {rtt: 30, offset: 5},
		};
		expect(buzzCommandSchema.parse(withDiag)).toEqual(withDiag);
	});
});

describe('adjustPressedAt', () => {
	const startedAt = 1000;
	const receivedAt = 2000;

	it('正常範囲内の申告時刻はそのままである', () => {
		expect(adjustPressedAt(1800, startedAt, receivedAt)).toBe(1800);
	});

	it('出題開始時刻より前の申告は出題開始時刻に丸められる (猶予下限が出題時刻より前の場合)', () => {
		// startedAt: 1000, receivedAt: 1200 (猶予下限: 700) -> 800 の申告は 1000 に丸められる
		expect(adjustPressedAt(800, 1000, 1200)).toBe(1000);
	});

	it('未来 (受信時刻より後) の申告は受信時刻に丸められる', () => {
		expect(adjustPressedAt(2500, startedAt, receivedAt)).toBe(receivedAt);
	});

	it('猶予期間 (受信時刻 - 500ms) より前の申告は猶予下限に丸められる', () => {
		expect(adjustPressedAt(1200, startedAt, receivedAt)).toBe(receivedAt - BUZZ_GRACE_MS);
	});

	it('出題開始直後の場合は出題開始時刻が猶予下限より優先される', () => {
		// 出題から 100ms 後に届いた場合、猶予 500ms は出題前を指すが、出題前には丸められない
		expect(adjustPressedAt(500, 1000, 1100)).toBe(1000);
	});

	it('カスタムの graceMs を指定できる', () => {
		expect(adjustPressedAt(1200, startedAt, receivedAt, 300)).toBe(receivedAt - 300);
	});
});

describe('arrangeBuzzes', () => {
	it('空の配列なら hasAnswerer: false を返す', () => {
		const res = arrangeBuzzes([]);
		expect(res.buzzes).toEqual([]);
		expect(res.hasAnswerer).toBe(false);
	});

	it('未判定の押下を pressedAt 昇順に並べ、先頭を answering にする', () => {
		const b1: Buzz = {participantId: 'p1', pressedAt: 1500, receivedAt: 1600, status: 'waiting'};
		const b2: Buzz = {participantId: 'p2', pressedAt: 1400, receivedAt: 1620, status: 'waiting'};
		const res = arrangeBuzzes([b1, b2]);

		expect(res.hasAnswerer).toBe(true);
		expect(res.buzzes).toEqual([
			{participantId: 'p2', pressedAt: 1400, receivedAt: 1620, status: 'answering'},
			{participantId: 'p1', pressedAt: 1500, receivedAt: 1600, status: 'waiting'},
		]);
	});

	it('pressedAt が同じなら receivedAt 昇順でタイブレークする', () => {
		const b1: Buzz = {participantId: 'p1', pressedAt: 1500, receivedAt: 1650, status: 'waiting'};
		const b2: Buzz = {participantId: 'p2', pressedAt: 1500, receivedAt: 1600, status: 'waiting'};
		const res = arrangeBuzzes([b1, b2]);

		expect(res.buzzes[0]?.participantId).toBe('p2');
		expect(res.buzzes[1]?.participantId).toBe('p1');
	});

	it('判定済みの押下は順序と状態を保持し、先頭側に残る', () => {
		const judged1: Buzz = {participantId: 'p1', pressedAt: 1100, receivedAt: 1200, status: 'wrong'};
		const judged2: Buzz = {participantId: 'p2', pressedAt: 1200, receivedAt: 1300, status: 'void'};
		const pending1: Buzz = {
			participantId: 'p3',
			pressedAt: 1500,
			receivedAt: 1600,
			status: 'waiting',
		};
		const pending2: Buzz = {
			participantId: 'p4',
			pressedAt: 1400,
			receivedAt: 1550,
			status: 'answering',
		};

		const res = arrangeBuzzes([judged1, judged2, pending1, pending2]);
		expect(res.hasAnswerer).toBe(true);
		expect(res.buzzes).toEqual([
			judged1,
			judged2,
			{participantId: 'p4', pressedAt: 1400, receivedAt: 1550, status: 'answering'},
			{participantId: 'p3', pressedAt: 1500, receivedAt: 1600, status: 'waiting'},
		]);
	});
});

describe('registerBuzz', () => {
	it('新しい押下を補正して追加し、整列する', () => {
		const existing: Buzz[] = [
			{participantId: 'p1', pressedAt: 1300, receivedAt: 1350, status: 'answering'},
		];
		const res = registerBuzz(existing, {
			participantId: 'p2',
			declaredPressedAt: 1200,
			startedAt: 1000,
			receivedAt: 1400,
		});

		expect(res.pressedAt).toBe(1200);
		expect(res.buzzes).toEqual([
			{participantId: 'p2', pressedAt: 1200, receivedAt: 1400, status: 'answering'},
			{participantId: 'p1', pressedAt: 1300, receivedAt: 1350, status: 'waiting'},
		]);
	});

	it('既に存在する参加者の押下は上書きされる', () => {
		const existing: Buzz[] = [
			{participantId: 'p1', pressedAt: 1300, receivedAt: 1350, status: 'answering'},
		];
		const res = registerBuzz(existing, {
			participantId: 'p1',
			declaredPressedAt: 1250,
			startedAt: 1000,
			receivedAt: 1360,
		});

		expect(res.buzzes).toHaveLength(1);
		expect(res.buzzes[0]?.participantId).toBe('p1');
		expect(res.buzzes[0]?.pressedAt).toBe(1250);
	});
});
