import type {ModeId} from '../types.ts';
import {buzzerBoard} from './buzzer-board/index.ts';
import {simpleBuzzer} from './simple-buzzer/index.ts';
import type {AnyModeDefinition} from './types.ts';

/** 企画の一覧。新しい企画はここに登録する */
export const modes: Record<ModeId, AnyModeDefinition> = {
	'simple-buzzer': simpleBuzzer,
	'buzzer-board': buzzerBoard,
};

export const isModeId = (id: string): id is ModeId => Object.hasOwn(modes, id);

export const getMode = (id: ModeId): AnyModeDefinition => modes[id];
