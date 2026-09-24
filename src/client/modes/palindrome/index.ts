import type {PalindromeState} from '../../../shared/modes/palindrome/index.ts';
import type {ModeScreens} from '../types.ts';
import {HostView} from './HostView.tsx';
import {getQuestionWarning} from './helpers.ts';
import {MonitorView} from './MonitorView.tsx';
import {ParticipantView} from './ParticipantView.tsx';
import {QuestionExtraFields} from './QuestionExtraFields.tsx';

export const palindromeScreens: ModeScreens<PalindromeState> = {
	Host: HostView,
	Participant: ParticipantView,
	Monitor: MonitorView,
	QuestionExtraFields,
	questionWarning: getQuestionWarning,
};
