import {type FormEvent, useEffect, useMemo, useRef, useState} from 'react';
import {
	type ListeningMathState,
	MAX_INTERVAL_SECONDS,
	questionsWithoutAudio,
} from '../../../shared/modes/listening-math/index.ts';
import type {Question} from '../../../shared/types.ts';
import {MathText} from '../../components/MathText.tsx';
import {useNotify, useRun} from '../../components/Toast.tsx';
import type {ScreenProps} from '../types.ts';
import {AudioPlayer, type PlaybackPosition} from './audioPlayer.ts';
import {
	audioOf,
	explanationFontSize,
	formatSeconds,
	questionFontSize,
	stringExtra,
} from './helpers.ts';
import styles from './MonitorView.module.css';

type Props = ScreenProps<ListeningMathState>;

const isTypingTarget = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** 押されたキーに対応する操作 (キーは KeyboardEvent.key) */
type KeyHandlers = Partial<Record<string, () => void>>;

const useKeyboard = (handlers: KeyHandlers) => {
	const ref = useRef(handlers);
	ref.current = handlers;
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
			if (isTypingTarget(event.target)) return;
			const handler = ref.current[event.key];
			if (!handler) return;
			event.preventDefault();
			// フォーカスの残ったボタンが Space で押されないようにする
			if (document.activeElement instanceof HTMLButtonElement) {
				document.activeElement.blur();
			}
			handler();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, []);
};

/** 再生位置を毎フレーム取り直す */
const usePlaybackPosition = (player: AudioPlayer, enabled: boolean) => {
	const [position, setPosition] = useState<PlaybackPosition | null>(null);
	useEffect(() => {
		if (!enabled) {
			setPosition(null);
			return;
		}
		let frame = 0;
		const update = () => {
			setPosition(player.position());
			frame = requestAnimationFrame(update);
		};
		update();
		return () => cancelAnimationFrame(frame);
	}, [player, enabled]);
	return position;
};

export const MonitorView = (props: Props) => {
	const {view, send} = props;
	const {game} = view;
	const {state} = game;
	const run = useRun();
	const notify = useNotify();

	const [player] = useState(() => new AudioPlayer());
	useEffect(() => () => player.dispose(), [player]);
	const [unlocked, setUnlocked] = useState(false);
	const [paused, setPaused] = useState(false);

	const audios = useMemo(() => game.questions.map(audioOf), [game.questions]);
	const reviewing = game.review !== null;
	const playing = state.phase === 'playing' && !reviewing;

	// コールバックから最新の値を読むため
	const latest = useRef({state, send});
	latest.current = {state, send};

	// サーバーの state に合わせて連続再生を始める・止める。再読込したときは、報告済みの問題から再開する
	const startedFor = useRef<number | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: 出題の開始 (startedAt) ごとに1度だけ再生を始める
	useEffect(() => {
		if (!unlocked) return;
		if (!playing) {
			if (startedFor.current !== null) {
				startedFor.current = null;
				player.stop();
				setPaused(false);
			}
			return;
		}
		if (startedFor.current === state.startedAt) return;
		startedFor.current = state.startedAt;
		setPaused(false);
		player.playSequence(audios, state.currentIndex, state.intervalSeconds, {
			onTrack: (index) => {
				if (index !== latest.current.state.currentIndex) {
					void run(() => latest.current.send({type: 'progress', index}));
				}
			},
			onFinish: () => {
				void run(() => latest.current.send({type: 'finish'}));
			},
			onError: (index) => notify(`第 ${index + 1} 問の音声を読み込めませんでした`, 'error'),
		});
	}, [unlocked, playing, state.startedAt]);

	const unlock = async () => {
		try {
			await player.unlock();
			setUnlocked(true);
		} catch (error) {
			notify(`音声を有効にできませんでした: ${String(error)}`, 'error');
		}
	};

	if (!unlocked) {
		return <Gate {...props} onUnlock={unlock} />;
	}
	if (reviewing) {
		return <ReviewScreen {...props} player={player} />;
	}
	if (playing) {
		return <PlayingScreen {...props} player={player} paused={paused} setPaused={setPaused} />;
	}
	return <IdleScreen {...props} />;
};

const Header = ({title, badge, right}: {title: string; badge: string; right?: string}) => (
	<header className={styles.header}>
		<div className={styles.titleArea}>
			<span className={styles.badge}>{badge}</span>
			<span className={styles.title}>{title}</span>
		</div>
		<div className={styles.headerRight}>{right}</div>
	</header>
);

const Gate = ({view, onUnlock}: Props & {onUnlock: () => void}) => {
	const {state, review} = view.game;
	const status =
		review !== null
			? `振り返り中 (第 ${review.index + 1} 問)`
			: state.phase === 'playing'
				? `出題中 (第 ${state.currentIndex + 1} 問)。有効にすると、この問題の最初から再開します`
				: null;
	return (
		<div className={styles.stage}>
			<Header title={view.game.title} badge="リスニング数学" />
			<main className={styles.center}>
				<p className={styles.lead}>
					ブラウザの自動再生の制限を解除するため、最初にボタンを押してください
				</p>
				<button type="button" className={styles.bigButton} onClick={onUnlock} autoFocus>
					🔊 音声を有効にする
				</button>
				{status && <p className={styles.status}>{status}</p>}
			</main>
		</div>
	);
};

const IdleScreen = ({view, send}: Props) => {
	const {game, questionCount} = view;
	const {state} = game;
	const run = useRun();
	const [from, setFrom] = useState('1');
	const [interval, setIntervalValue] = useState(String(state.intervalSeconds));

	useEffect(() => setIntervalValue(String(state.intervalSeconds)), [state.intervalSeconds]);

	const missing = questionsWithoutAudio(game.questions);
	const canPlay = questionCount > 0 && missing.length === 0;
	const resumable = state.phase === 'idle' && state.startedAt !== null;

	const play = (index: number) => void run(() => send({type: 'play', index}));

	const onPlayFrom = (event: FormEvent) => {
		event.preventDefault();
		const index = Number.parseInt(from, 10) - 1;
		if (!Number.isNaN(index)) play(index);
	};

	const onInterval = (event: FormEvent) => {
		event.preventDefault();
		const seconds = Number(interval);
		if (Number.isFinite(seconds)) {
			void run(() => send({type: 'setInterval', seconds}));
		}
	};

	return (
		<div className={styles.stage}>
			<Header title={game.title} badge="リスニング数学" right={`全 ${questionCount} 問`} />
			<main className={styles.center}>
				{state.phase === 'played' && (
					<p className={styles.done}>全 {questionCount} 問の出題が終わりました</p>
				)}
				{resumable && (
					<p className={styles.status}>第 {state.currentIndex + 1} 問で停止しています</p>
				)}
				<div className={styles.actions}>
					<button
						type="button"
						className={styles.bigButton}
						onClick={() => play(0)}
						disabled={!canPlay}
					>
						▶ {state.phase === 'played' ? 'もう一度出題' : '出題開始'}
					</button>
					{resumable && (
						<button
							type="button"
							className={styles.bigButtonSub}
							onClick={() => play(state.currentIndex)}
							disabled={!canPlay}
						>
							第 {state.currentIndex + 1} 問から再開
						</button>
					)}
				</div>
				{missing.length > 0 && (
					<p className={styles.warning}>
						音声が登録されていない問題があります (第 {missing.join('、')} 問)
					</p>
				)}
				{questionCount === 0 && <p className={styles.warning}>問題がありません</p>}

				<div className={styles.settings}>
					<form className={styles.settingRow} onSubmit={onPlayFrom}>
						<span>第</span>
						<input
							type="number"
							min={1}
							max={questionCount}
							value={from}
							onChange={(event) => setFrom(event.target.value)}
							aria-label="開始する問題の番号"
						/>
						<span>問から</span>
						<button type="submit" disabled={!canPlay}>
							出題
						</button>
					</form>
					<form className={styles.settingRow} onSubmit={onInterval}>
						<span>問題の間隔</span>
						<input
							type="number"
							min={0}
							max={MAX_INTERVAL_SECONDS}
							step={0.5}
							value={interval}
							onChange={(event) => setIntervalValue(event.target.value)}
							aria-label="問題の間隔 (秒)"
						/>
						<span>秒</span>
						<button type="submit" disabled={Number(interval) === state.intervalSeconds}>
							変更
						</button>
					</form>
					<button
						type="button"
						className={styles.reviewButton}
						onClick={() => void run(() => send({type: 'review.start'}))}
						disabled={questionCount === 0}
					>
						振り返りを始める
					</button>
				</div>
			</main>
		</div>
	);
};

const PlayingScreen = ({
	view,
	send,
	player,
	paused,
	setPaused,
}: Props & {player: AudioPlayer; paused: boolean; setPaused: (paused: boolean) => void}) => {
	const {game, questionCount} = view;
	const run = useRun();
	const position = usePlaybackPosition(player, true);
	const index = position?.index ?? game.state.currentIndex;
	const trackRatio = position && position.duration > 0 ? position.elapsed / position.duration : 0;
	const overall = questionCount > 0 ? (index + trackRatio) / questionCount : 0;

	const togglePause = async () => {
		if (player.paused) {
			await player.resume();
			setPaused(false);
		} else {
			await player.pause();
			setPaused(true);
		}
	};
	const jump = (delta: number) => {
		player.jump((player.position()?.index ?? index) + delta);
		setPaused(false);
	};
	const stop = () => {
		if (window.confirm('出題を停止しますか? (あとで途中の問題から再開できます)')) {
			void run(() => send({type: 'stop'}));
		}
	};

	useKeyboard({
		' ': () => void togglePause(),
		ArrowRight: () => jump(1),
		ArrowLeft: () => jump(-1),
		Escape: stop,
	});

	return (
		<div className={styles.stage}>
			<Header title={game.title} badge="出題中" right={paused ? '⏸ 一時停止中' : undefined} />
			<main className={styles.center}>
				<div className={styles.counter}>
					<span className={styles.counterLabel}>第</span>
					<span className={styles.counterNumber}>{index + 1}</span>
					<span className={styles.counterLabel}>問</span>
					<span className={styles.counterTotal}>/ 全 {questionCount} 問</span>
				</div>
				<div className={styles.progressTrack}>
					<div className={styles.progressFill} style={{width: `${overall * 100}%`}} />
					{Array.from({length: questionCount - 1}, (_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: 問題の区切りの目盛り
							key={i}
							className={styles.progressTick}
							style={{left: `${((i + 1) / questionCount) * 100}%`}}
						/>
					))}
				</div>
				<div className={styles.trackTime}>
					{position && position.duration > 0
						? `${formatSeconds(position.elapsed)} / ${formatSeconds(position.duration, 'ceil')}`
						: '読み込み中…'}
				</div>
			</main>
			<footer className={styles.footer}>
				<div className={styles.controls}>
					<button type="button" onClick={() => jump(-1)}>
						⏮ 前の問題 (←)
					</button>
					<button type="button" onClick={() => void togglePause()}>
						{paused ? '▶ 再開' : '⏸ 一時停止'} (Space)
					</button>
					<button type="button" onClick={() => jump(1)}>
						次の問題 ⏭ (→)
					</button>
					<button type="button" onClick={stop}>
						■ 停止 (Esc)
					</button>
				</div>
			</footer>
		</div>
	);
};

const ReviewScreen = ({view, send, player}: Props & {player: AudioPlayer}) => {
	const {game} = view;
	const run = useRun();
	const notify = useNotify();
	const index = game.review?.index ?? 0;
	const total = game.questions.length;
	const question: Question | undefined = game.questions[index];
	const [audioPlaying, setAudioPlaying] = useState(false);
	const position = usePlaybackPosition(player, audioPlaying);

	// 問題を移動したら音声を止める
	// biome-ignore lint/correctness/useExhaustiveDependencies: 問題の移動のたびに止める
	useEffect(() => {
		player.stop();
		setAudioPlaying(false);
	}, [player, index]);

	const toggleAudio = () => {
		if (audioPlaying) {
			player.stop();
			setAudioPlaying(false);
			return;
		}
		const audio = audioOf(question);
		if (!audio) {
			notify('この問題には音声がありません', 'error');
			return;
		}
		player.playSingle(audio, {
			onFinish: () => setAudioPlaying(false),
			onError: () => {
				setAudioPlaying(false);
				notify('音声を読み込めませんでした', 'error');
			},
		});
		setAudioPlaying(true);
	};
	const move = (next: number) => {
		if (next >= 0 && next < total) void run(() => send({type: 'review.move', index: next}));
	};
	const end = () => {
		if (window.confirm('振り返りを終えますか?')) void run(() => send({type: 'review.end'}));
	};

	useKeyboard({
		' ': toggleAudio,
		ArrowLeft: () => move(index - 1),
		ArrowRight: () => move(index + 1),
		Escape: end,
	});

	const explanation = stringExtra(question, 'explanation');
	const source = stringExtra(question, 'source');
	const text = question?.text ?? '';

	return (
		<div className={styles.stage}>
			<Header title={game.title} badge="振り返り" right={`第 ${index + 1} 問 / 全 ${total} 問`} />
			<main className={styles.review}>
				<section className={`${styles.panel} ${styles.questionPanel}`}>
					<div className={styles.panelLabel}>第 {index + 1} 問</div>
					<div className={styles.questionText} style={{fontSize: questionFontSize(text)}}>
						{text || '(問題文なし)'}
					</div>
				</section>
				<section className={`${styles.panel} ${styles.answerPanel}`}>
					<div className={styles.panelLabel}>正解</div>
					<div className={styles.answerText}>{question?.answer || '—'}</div>
				</section>
				<section className={`${styles.panel} ${styles.explanationPanel}`}>
					<div className={styles.panelLabel}>解説</div>
					{explanation ? (
						<MathText
							text={explanation}
							className={styles.explanation}
							style={{fontSize: explanationFontSize(explanation)}}
						/>
					) : (
						<div className={styles.placeholder}>解説はありません</div>
					)}
				</section>
			</main>
			<footer className={styles.footer}>
				<div className={styles.controls}>
					<button type="button" onClick={() => move(index - 1)} disabled={index <= 0}>
						← 前へ
					</button>
					<button type="button" className={styles.playButton} onClick={toggleAudio}>
						{audioPlaying ? '■ 音声を止める' : '▶ この問題の音声を再生'} (Space)
					</button>
					<button type="button" onClick={() => move(index + 1)} disabled={index >= total - 1}>
						次へ →
					</button>
					{audioPlaying && position && position.duration > 0 && (
						<span className={styles.reviewTime}>
							{formatSeconds(position.elapsed)} / {formatSeconds(position.duration, 'ceil')}
						</span>
					)}
					<button type="button" className={styles.endButton} onClick={end}>
						振り返りを終える
					</button>
				</div>
				{source && <div className={styles.source}>出典: {source}</div>}
			</footer>
		</div>
	);
};
