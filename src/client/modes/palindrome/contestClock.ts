import {useEffect, useState} from 'react';
import {isAccepting, type PalindromeState} from '../../../shared/modes/palindrome/index.ts';
import {localNow, toServerTime} from '../../lib/clock.ts';

export interface ContestClock {
	/** 回答を受け付けているか */
	accepting: boolean;
	/** 終了予定時刻を過ぎたか、終了したか */
	over: boolean;
	/** 残り時間 (開始前は制限時間) */
	remainingMs: number;
	/** 開始からの経過時間 (開始前は null) */
	elapsedMs: number | null;
}

export const contestClock = (state: PalindromeState, now: number): ContestClock => {
	if (state.phase === 'waiting' || state.startedAt === null || state.endsAt === null) {
		return {accepting: false, over: false, remainingMs: state.durationMs, elapsedMs: null};
	}
	const end = state.phase === 'finished' ? (state.finishedAt ?? state.endsAt) : state.endsAt;
	const accepting = isAccepting(state, now);
	return {
		accepting,
		over: !accepting,
		remainingMs: accepting ? state.endsAt - now : 0,
		elapsedMs: Math.min(now, end) - state.startedAt,
	};
};

/** サーバーの時計に合わせて、コンテストの残り時間を刻む */
export const useContestClock = (state: PalindromeState): ContestClock => {
	const [now, setNow] = useState(() => toServerTime(localNow()));
	const running = state.phase === 'running';

	useEffect(() => {
		if (!running) return;
		setNow(toServerTime(localNow()));
		const timer = setInterval(() => setNow(toServerTime(localNow())), 250);
		return () => clearInterval(timer);
	}, [running]);

	return contestClock(state, now);
};
