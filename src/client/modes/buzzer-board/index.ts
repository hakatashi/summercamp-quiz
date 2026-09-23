import type {BuzzerBoardState} from '../../../shared/modes/buzzer-board/index.ts';
import type {ModeScreens} from '../types.ts';
import {HostView} from './HostView.tsx';
import {MonitorView} from './MonitorView.tsx';
import {ParticipantView} from './ParticipantView.tsx';
import {QuestionExtraFields} from './QuestionExtraFields.tsx';

export const buzzerBoardScreens: ModeScreens<BuzzerBoardState> = {
	Host: HostView,
	Participant: ParticipantView,
	Monitor: MonitorView,
	QuestionExtraFields,
	tsvExtraColumns: [
		{
			label: 'ジャンル',
			toExtra: (cell: string) => ({genre: cell.trim()}),
		},
	],
};
