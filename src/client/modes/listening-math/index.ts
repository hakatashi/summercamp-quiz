import type {ListeningMathState} from '../../../shared/modes/listening-math/index.ts';
import type {ModeScreens} from '../types.ts';
import {getQuestionWarning} from './helpers.ts';
import {MonitorView} from './MonitorView.tsx';
import {QuestionExtraFields} from './QuestionExtraFields.tsx';

/** 司会者画面と参加者画面はない。操作はモニター画面で行う (振り返りもモニター画面の中で扱う) */
export const listeningMathScreens: ModeScreens<ListeningMathState> = {
	Monitor: MonitorView,
	QuestionExtraFields,
	tsvExtraColumns: [
		{label: '解説', toExtra: (cell: string) => ({explanation: cell.trim()})},
		{label: '出典', toExtra: (cell: string) => ({source: cell.trim()})},
		{label: '音声 ID', toExtra: (cell: string) => ({audio: cell.trim()})},
	],
	questionWarning: getQuestionWarning,
};
