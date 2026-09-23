import type {SimpleBuzzerState} from '../../../shared/modes/simple-buzzer/index.ts';
import type {ModeScreens} from '../types.ts';
import {HostView} from './HostView.tsx';
import {MonitorView} from './MonitorView.tsx';
import {ParticipantView} from './ParticipantView.tsx';

export const simpleBuzzerScreens: ModeScreens<SimpleBuzzerState> = {
	Host: HostView,
	Participant: ParticipantView,
	Monitor: MonitorView,
};
