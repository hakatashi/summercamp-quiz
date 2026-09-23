import {useRef, useState} from 'react';
import type {BuzzDiag} from '../../../shared/buzz.ts';
import {
	type BuzzerBoardState,
	currentRecord,
	GENRES,
	type Genre,
	isCleared,
	restOf,
	scoreOf,
} from '../../../shared/modes/buzzer-board/index.ts';
import {BuzzButton} from '../../components/BuzzButton.tsx';
import {ClockDiagnostics} from '../../components/ClockDiagnostics.tsx';
import {useNotify} from '../../components/Toast.tsx';
import type {ScreenProps} from '../types.ts';
import {findQuestion, isOpen, previousRecord, standings} from './helpers.ts';
import styles from './ParticipantView.module.css';

export const ParticipantView = ({view, send, participantId}: ScreenProps<BuzzerBoardState>) => {
	const {game} = view;
	const {state} = game;
	const notify = useNotify();
	const [diagOpen, setDiagOpen] = useState(false);
	const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const startLongPress = () => {
		if (longPressTimer.current) clearTimeout(longPressTimer.current);
		longPressTimer.current = setTimeout(() => {
			navigator.vibrate?.(30);
			setDiagOpen(true);
		}, 500);
	};

	const clearLongPress = () => {
		if (longPressTimer.current) {
			clearTimeout(longPressTimer.current);
			longPressTimer.current = null;
		}
	};

	const me = game.participants.find((p) => p.id === participantId);
	const myScore = scoreOf(state, participantId ?? '');
	const myRest = restOf(state, participantId ?? '');
	const myCleared = isCleared(state, participantId ?? '');
	const isMyGenreTurn = state.genreChooser === participantId;

	const record = currentRecord(state);
	const myBuzz = record?.buzzes.find(
		(b) => b.participantId === participantId && b.status !== 'void',
	);

	const canBuzz = isOpen(state) && !myCleared && myRest === 0 && !myBuzz;

	// 押せない理由
	const disableReason = (() => {
		if (myCleared) return '早押し勝ち抜けです (ボードクイズをお待ちください)';
		if (myRest > 0) return `お休み中です (残り ${myRest} 問)`;
		if (myBuzz) {
			if (myBuzz.status === 'answering') return 'あなたの回答です!';
			if (myBuzz.status === 'waiting') return '回答権待ちです';
			if (myBuzz.status === 'wrong') return '誤答しました';
			if (myBuzz.status === 'correct') return '正解しました!';
			return 'ボタン押下済みです';
		}
		if (!isOpen(state)) {
			if (state.phase === 'waiting') return '開始をお待ちください';
			if (state.phase === 'closed') return '問題終了';
			if (state.phase === 'finished') return '全問終了';
		}
		return null;
	})();

	const pending = record?.buzzes.filter((b) => b.status === 'waiting' || b.status === 'answering');
	const myOrder = myBuzz && pending ? pending.indexOf(myBuzz) + 1 : 0;

	const status = (() => {
		if (myCleared) {
			return {text: '勝ち抜け!', tone: 'cleared'};
		}
		if (myRest > 0) {
			return {text: `休み中 (残り ${myRest} 問)`, tone: 'rest'};
		}
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
				return {text: '誤答', tone: 'wrong'};
			case 'correct':
				return {text: '正解!', tone: 'correct'};
		}
		return {
			text: state.phase === 'answering' ? '他の人が回答中' : '問題読み上げ中',
			tone: 'neutral',
		};
	})();

	const onPress = async (pressedAt: number, diag?: BuzzDiag) => {
		try {
			await send({type: 'buzz', pressedAt, ...(diag ? {diag} : {})});
		} catch (error) {
			notify(error instanceof Error ? error.message : String(error), 'error');
			throw error;
		}
	};

	const onChooseGenre = async (genre: Genre) => {
		try {
			await send({type: 'chooseGenre', genre});
			notify(`次のジャンルに「${genre}」を選択しました`);
		} catch (error) {
			notify(error instanceof Error ? error.message : String(error), 'error');
		}
	};

	const previous = previousRecord(state);
	const previousQuestion = previous ? findQuestion(game, previous.questionId) : undefined;
	const rank = standings(game).find((s) => s.participant.id === participantId)?.rank;

	return (
		<div className={styles.container}>
			<header
				className={styles.header}
				onPointerDown={startLongPress}
				onPointerUp={clearLongPress}
				onPointerLeave={clearLongPress}
				onPointerCancel={clearLongPress}
				title="長押しで接続・時計診断を表示"
			>
				<div className={styles.nameGroup}>
					<div className={styles.name}>{me?.name}</div>
					{myCleared && <span className={styles.clearedTag}>勝ち抜け</span>}
					<button
						type="button"
						className={styles.diagBadge}
						onClick={(e) => {
							e.stopPropagation();
							setDiagOpen(true);
						}}
						title="接続・時計診断 (ヘッダー長押しでも開きます)"
					>
						診断
					</button>
				</div>
				<div className={styles.score}>
					<span className={styles.scoreValue}>{myScore}</span>
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
					armKey={`${state.history.length}:${record?.startedAt ?? ''}:${myBuzz ? 1 : 0}:${myRest}:${myCleared ? 1 : 0}`}
					label="PUSH"
					onPress={onPress}
				/>
				{disableReason && <div className={styles.disableReason}>{disableReason}</div>}
				<p className={styles.hint}>PC では Enter キーかスペースキーでも押せます</p>
			</div>

			{isMyGenreTurn && (
				<div className={styles.genreChooserOverlay}>
					<div className={styles.genreChooserModal}>
						<h2 className={styles.genreChooserTitle}>次のジャンルを選択してください</h2>
						<p className={styles.genreChooserSub}>
							正解ボーナス！次の問題のジャンルを1つ選べます。
						</p>
						<div className={styles.genreGrid}>
							{GENRES.map((g) => {
								const count = state.unaskedCounts[g] ?? 0;
								return (
									<button
										key={g}
										type="button"
										className={styles.genreBtn}
										disabled={count <= 0}
										onClick={() => onChooseGenre(g)}
									>
										<span>{g}</span>
										<span className={styles.genreBtnCount}>残り {count} 問</span>
									</button>
								);
							})}
						</div>
					</div>
				</div>
			)}

			{previousQuestion && state.phase !== 'reading' && state.phase !== 'answering' && (
				<section className={styles.previous}>
					<div className={styles.previousLabel}>前の問題 ({previous?.genre ?? ''})</div>
					<div className={styles.previousText}>{previousQuestion.text}</div>
					<div className={styles.previousAnswer}>答え: {previousQuestion.answer}</div>
				</section>
			)}

			<ClockDiagnostics isOpen={diagOpen} onClose={() => setDiagOpen(false)} />
		</div>
	);
};
