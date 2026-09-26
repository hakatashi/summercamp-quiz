import {describe, expect, it} from 'vitest';
import type {Buzz, BuzzStatus} from '../../shared/buzz.ts';
import {type BuzzerSoundRecord, buzzerSoundCues} from './buzzerSounds.ts';

const buzz = (participantId: string, pressedAt: number, status: BuzzStatus): Buzz => ({
	participantId,
	pressedAt,
	receivedAt: pressedAt,
	status,
});

const record = (buzzes: Buzz[], result: string | null = null): BuzzerSoundRecord => ({
	questionId: 'q1',
	startedAt: 1000,
	buzzes,
	result,
});

describe('buzzerSoundCues', () => {
	it('ボタンが押されたらブザーを鳴らす', () => {
		expect(buzzerSoundCues(record([]), record([buzz('a', 1100, 'answering')]))).toEqual(['buzzer']);
	});

	it('順番待ちの押下でもブザーを鳴らす', () => {
		const prev = record([buzz('a', 1100, 'answering')]);
		const next = record([buzz('a', 1100, 'answering'), buzz('b', 1200, 'waiting')]);
		expect(buzzerSoundCues(prev, next)).toEqual(['buzzer']);
	});

	it('正解・誤答の判定で効果音を鳴らす', () => {
		const prev = record([buzz('a', 1100, 'answering'), buzz('b', 1200, 'waiting')]);
		expect(
			buzzerSoundCues(
				prev,
				record([buzz('a', 1100, 'correct'), buzz('b', 1200, 'void')], 'correct'),
			),
		).toEqual(['correct']);
		expect(
			buzzerSoundCues(prev, record([buzz('a', 1100, 'wrong'), buzz('b', 1200, 'answering')])),
		).toEqual(['wrong']);
	});

	it('スルーでタイムアップ音を鳴らす', () => {
		expect(buzzerSoundCues(record([]), record([], 'through'))).toEqual(['timeup']);
	});

	it('全員誤答では誤答音だけを鳴らす', () => {
		const prev = record([buzz('a', 1100, 'answering')]);
		expect(buzzerSoundCues(prev, record([buzz('a', 1100, 'wrong')], 'all-wrong'))).toEqual([
			'wrong',
		]);
	});

	it('押下のリセットや取り消しでは鳴らさない', () => {
		const prev = record([buzz('a', 1100, 'answering')]);
		expect(buzzerSoundCues(prev, record([]))).toEqual([]);
		expect(buzzerSoundCues(prev, record([buzz('a', 1100, 'void')], 'cancelled'))).toEqual([]);
	});

	it('リセット後に同じ参加者が押し直したら鳴らす', () => {
		const prev = record([]);
		const next = record([buzz('a', 1500, 'answering')]);
		expect(buzzerSoundCues(prev, next)).toEqual(['buzzer']);
	});

	it('判定の取り消しで戻ったときは鳴らさない', () => {
		const prev = record([buzz('a', 1100, 'correct')], 'correct');
		expect(buzzerSoundCues(prev, record([buzz('a', 1100, 'answering')]))).toEqual([]);
	});

	it('別の問題に切り替わったときや初回表示では鳴らさない', () => {
		const prev = record([buzz('a', 1100, 'correct')], 'correct');
		const next: BuzzerSoundRecord = {
			questionId: 'q2',
			startedAt: 2000,
			buzzes: [buzz('b', 2100, 'answering')],
			result: null,
		};
		expect(buzzerSoundCues(prev, next)).toEqual([]);
		expect(buzzerSoundCues(null, next)).toEqual([]);
	});
});
