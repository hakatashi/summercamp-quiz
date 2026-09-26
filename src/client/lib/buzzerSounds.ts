import {useEffect, useRef, useSyncExternalStore} from 'react';
import type {Buzz} from '../../shared/buzz.ts';
import {
	isSoundBlocked,
	playSoundEffect,
	preloadSoundEffects,
	type SoundEffect,
	subscribeSoundState,
} from './soundEffects.ts';

/** 早押し系の企画で共通する、出題1回分の記録のうち効果音の判断に使う部分 */
export interface BuzzerSoundRecord {
	questionId: string;
	startedAt: number;
	buzzes: readonly Buzz[];
	result: string | null;
}

const buzzKey = (buzz: Buzz) => `${buzz.participantId}:${buzz.pressedAt}`;

/**
 * 直前の記録と今の記録を比べて、鳴らす効果音を返す。
 * 別の問題に切り替わったときや、取り消しで状態が戻ったときは鳴らさない。
 */
export const buzzerSoundCues = (
	prev: BuzzerSoundRecord | null,
	next: BuzzerSoundRecord | null,
): SoundEffect[] => {
	if (!prev || !next) return [];
	if (prev.questionId !== next.questionId || prev.startedAt !== next.startedAt) return [];

	const before = new Map(prev.buzzes.map((b) => [buzzKey(b), b.status]));
	const cues = new Set<SoundEffect>();
	for (const buzz of next.buzzes) {
		const status = before.get(buzzKey(buzz));
		if (status === undefined) {
			if (buzz.status !== 'void') cues.add('buzzer');
		} else if (status !== buzz.status && (buzz.status === 'correct' || buzz.status === 'wrong')) {
			cues.add(buzz.status);
		}
	}
	if (prev.result === null && next.result === 'through') {
		cues.add('timeup');
	}
	return [...cues];
};

/** 出題中の記録の変化に合わせて効果音を鳴らす。戻り値は自動再生の制限で音が鳴らない状態か */
export const useBuzzerSounds = (record: BuzzerSoundRecord | null): boolean => {
	useEffect(() => {
		preloadSoundEffects();
	}, []);

	const previous = useRef(record);
	useEffect(() => {
		const cues = buzzerSoundCues(previous.current, record);
		previous.current = record;
		for (const cue of cues) {
			playSoundEffect(cue).catch(() => {});
		}
	}, [record]);

	return useSyncExternalStore(subscribeSoundState, isSoundBlocked, () => false);
};
