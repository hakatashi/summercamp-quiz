import {
	currentRecord,
	type SimpleBuzzerState,
	scoreOf,
} from '../../../shared/modes/simple-buzzer/index.ts';
import {BuzzButton} from '../../components/BuzzButton.tsx';
import {useNotify} from '../../components/Toast.tsx';
import type {ScreenProps} from '../types.ts';
import {findQuestion, isOpen, previousRecord, standings} from './helpers.ts';
import styles from './ParticipantView.module.css';

export const ParticipantView = ({view, send, participantId}: ScreenProps<SimpleBuzzerState>) => {
	const {game} = view;
	const {state} = game;
	const notify = useNotify();
	const me = game.participants.find((p) => p.id === participantId);
	const record = currentRecord(state);
	const myBuzz = record?.buzzes.find(
		(b) => b.participantId === participantId && b.status !== 'void',
	);
	const canBuzz = isOpen(state) && !myBuzz;
	const pending = record?.buzzes.filter((b) => b.status === 'waiting' || b.status === 'answering');
	const myOrder = myBuzz && pending ? pending.indexOf(myBuzz) + 1 : 0;

	const status = (() => {
		switch (state.phase) {
			case 'waiting':
				return {text: 'まもなく開始します', tone: 'neutral'};
			case 'finished':
				return {text: '全問終了!', tone: 'neutral'};
			case 'closed':
				return {text: '問題終了', tone: 'neutral'};
		}
		switch (myBuzz?.status) {
			case 'answering':
				return {text: 'あなたの回答です!', tone: 'answering'};
			case 'waiting':
				return {text: `回答権待ち (${myOrder} 番目)`, tone: 'waiting'};
			case 'wrong':
				return {text: '誤答 (この問題では押せません)', tone: 'wrong'};
			case 'correct':
				return {text: '正解!', tone: 'correct'};
		}
		return {
			text: state.phase === 'answering' ? '他の人が回答中' : '問題読み上げ中',
			tone: 'neutral',
		};
	})();

	const onPress = async (pressedAt: number) => {
		try {
			await send({type: 'buzz', pressedAt});
		} catch (error) {
			notify(error instanceof Error ? error.message : String(error), 'error');
			throw error;
		}
	};

	const previous = previousRecord(state);
	const previousQuestion = previous ? findQuestion(game, previous.questionId) : undefined;
	const rank = standings(game).find((s) => s.participant.id === participantId)?.rank;

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<div className={styles.name}>{me?.name}</div>
				<div className={styles.score}>
					<span className={styles.scoreValue}>{scoreOf(state, participantId ?? '')}</span>
					<span className={styles.scoreUnit}>pt</span>
					{rank !== undefined && <span className={styles.rank}>{rank} 位</span>}
				</div>
			</header>

			<div className={styles.status} data-tone={status.tone}>
				{status.text}
			</div>

			<div className={styles.buttonArea}>
				<BuzzButton
					enabled={canBuzz}
					armKey={`${state.history.length}:${record?.startedAt ?? ''}:${myBuzz ? 1 : 0}`}
					label="PUSH"
					onPress={onPress}
				/>
				<p className={styles.hint}>PC では Enter キーかスペースキーでも押せます</p>
			</div>

			{previousQuestion && state.phase !== 'reading' && state.phase !== 'answering' && (
				<section className={styles.previous}>
					<div className={styles.previousLabel}>前の問題</div>
					<div className={styles.previousText}>{previousQuestion.text}</div>
					<div className={styles.previousAnswer}>答え: {previousQuestion.answer}</div>
				</section>
			)}
		</div>
	);
};
