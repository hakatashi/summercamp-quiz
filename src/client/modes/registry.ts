import type {ModeId} from '../../shared/types.ts';
import {buzzerBoardScreens} from './buzzer-board/index.ts';
import {listeningMathScreens} from './listening-math/index.ts';
import {palindromeScreens} from './palindrome/index.ts';
import {simpleBuzzerScreens} from './simple-buzzer/index.ts';
import type {ModeScreens} from './types.ts';

/** 企画ごとの画面。新しい企画はここに登録する */
// biome-ignore lint/suspicious/noExplicitAny: 企画ごとに state の型が違う
export const screens: Record<ModeId, ModeScreens<any>> = {
	'simple-buzzer': simpleBuzzerScreens,
	'buzzer-board': buzzerBoardScreens,
	palindrome: palindromeScreens,
	'listening-math': listeningMathScreens,
};
