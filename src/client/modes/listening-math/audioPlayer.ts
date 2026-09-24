import {mediaUrl} from '../../../shared/media.ts';

export interface SequenceCallbacks {
	/** index 番目の音声が鳴り始めた */
	onTrack?: (index: number) => void;
	/** 最後の音声を再生し終えた */
	onFinish?: () => void;
	/** 音声を読み込めなかった */
	onError?: (index: number, error: unknown) => void;
}

interface ScheduledTrack {
	index: number;
	source: AudioBufferSourceNode;
	/** AudioContext の時刻 (秒) */
	start: number;
	end: number;
}

interface Sequence {
	generation: number;
	audios: readonly string[];
	intervalSeconds: number;
	callbacks: SequenceCallbacks;
	/** 読み込み中で、まだ鳴らす時刻を決めていない問題 */
	loadingIndex: number | null;
	reportedIndex: number;
	finished: boolean;
}

export interface PlaybackPosition {
	index: number;
	/** 問題の音声の中での経過秒数 */
	elapsed: number;
	duration: number;
}

/** 読み込んで復号した音声をいくつまで持っておくか */
const CACHE_SIZE = 6;
/** 状態を確認する間隔 (ミリ秒)。次の音声の予約は再生中の音声が鳴り始めた時点で行うので、粗くてよい */
const TICK_MS = 100;

/**
 * 問題音声を順に再生する。AudioContext を1つ使い回し、次の音声を先に読み込んで、
 * 前の音声が終わる時刻ちょうどに鳴るよう予約するので、曲間に空白が出ない。
 * 一時停止は AudioContext ごと止める (予約した時刻もそのまま後ろにずれる)。
 */
export class AudioPlayer {
	#context: AudioContext | null = null;
	readonly #buffers = new Map<string, Promise<AudioBuffer>>();
	#tracks: ScheduledTrack[] = [];
	#sequence: Sequence | null = null;
	#generation = 0;
	#timer: ReturnType<typeof setInterval> | undefined;

	/** 自動再生の制限を解除する。ボタンを押したときのイベントの中で呼ぶこと */
	async unlock(): Promise<void> {
		const context = this.#context ?? new AudioContext();
		this.#context = context;
		// 無音を一度鳴らして、再生を許可させる
		const silence = context.createBufferSource();
		silence.buffer = context.createBuffer(1, 1, context.sampleRate);
		silence.connect(context.destination);
		silence.start();
		await context.resume();
	}

	get paused(): boolean {
		return this.#context?.state === 'suspended';
	}

	#requireContext(): AudioContext {
		if (!this.#context) {
			throw new Error('音声が有効になっていません');
		}
		return this.#context;
	}

	/** 音声を読み込んで復号する。同じ音声は使い回す */
	load(audioId: string): Promise<AudioBuffer> {
		const cached = this.#buffers.get(audioId);
		if (cached) {
			// 最近使ったものを後ろに回す
			this.#buffers.delete(audioId);
			this.#buffers.set(audioId, cached);
			return cached;
		}
		const context = this.#requireContext();
		const promise = fetch(mediaUrl(audioId))
			.then((response) => {
				if (!response.ok) {
					throw new Error(`音声を読み込めませんでした (${response.status})`);
				}
				return response.arrayBuffer();
			})
			.then((data) => context.decodeAudioData(data));
		promise.catch(() => this.#buffers.delete(audioId));
		this.#buffers.set(audioId, promise);
		while (this.#buffers.size > CACHE_SIZE) {
			const oldest = this.#buffers.keys().next().value as string;
			this.#buffers.delete(oldest);
		}
		return promise;
	}

	/** from 番目から順に再生する。再生中のものは止める */
	playSequence(
		audios: readonly string[],
		from: number,
		intervalSeconds: number,
		callbacks: SequenceCallbacks,
	): void {
		const context = this.#requireContext();
		this.stop();
		const sequence: Sequence = {
			generation: ++this.#generation,
			audios,
			intervalSeconds,
			callbacks,
			loadingIndex: null,
			reportedIndex: -1,
			finished: false,
		};
		this.#sequence = sequence;
		void context.resume();
		void this.#schedule(sequence, from, context.currentTime + 0.1);
		this.#timer = setInterval(() => this.#tick(), TICK_MS);
	}

	/** 1つの音声だけを再生する */
	playSingle(audioId: string, callbacks: Pick<SequenceCallbacks, 'onFinish' | 'onError'>): void {
		this.playSequence([audioId], 0, 0, callbacks);
	}

	/** 再生中の連続再生を index 番目からやり直す (問題を飛ばす・戻る) */
	jump(index: number): void {
		const sequence = this.#sequence;
		if (!sequence) return;
		if (index >= sequence.audios.length) {
			this.stop();
			sequence.callbacks.onFinish?.();
			return;
		}
		this.playSequence(
			sequence.audios,
			Math.max(0, index),
			sequence.intervalSeconds,
			sequence.callbacks,
		);
	}

	pause(): Promise<void> {
		return this.#context?.suspend() ?? Promise.resolve();
	}

	resume(): Promise<void> {
		return this.#context?.resume() ?? Promise.resolve();
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#timer = undefined;
		this.#generation++;
		this.#sequence = null;
		for (const track of this.#tracks) {
			track.source.onended = null;
			try {
				track.source.stop();
			} catch {
				// まだ start していない、または停止済み
			}
			track.source.disconnect();
		}
		this.#tracks = [];
		void this.#context?.resume();
	}

	/** 今鳴っている (曲間なら直前に鳴っていた) 音声の位置 */
	position(): PlaybackPosition | null {
		const context = this.#context;
		if (!context || !this.#sequence) return null;
		const now = context.currentTime;
		const track = this.#tracks.findLast((t) => t.start <= now) ?? this.#tracks[0];
		if (!track) {
			const index = this.#sequence.loadingIndex;
			return index === null ? null : {index, elapsed: 0, duration: 0};
		}
		const duration = track.end - track.start;
		return {
			index: track.index,
			elapsed: Math.min(Math.max(now - track.start, 0), duration),
			duration,
		};
	}

	dispose(): void {
		this.stop();
		void this.#context?.close();
		this.#context = null;
		this.#buffers.clear();
	}

	async #schedule(sequence: Sequence, index: number, at: number): Promise<void> {
		const context = this.#requireContext();
		const audioId = sequence.audios[index];
		if (audioId === undefined) return;
		sequence.loadingIndex = index;
		let buffer: AudioBuffer;
		try {
			buffer = await this.load(audioId);
		} catch (error) {
			if (sequence.generation !== this.#generation) return;
			sequence.callbacks.onError?.(index, error);
			// 読み込めなかった問題は飛ばす
			this.jump(index + 1);
			return;
		}
		if (sequence.generation !== this.#generation) return;
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.connect(context.destination);
		const start = Math.max(at, context.currentTime + 0.05);
		source.start(start);
		this.#tracks.push({index, source, start, end: start + buffer.duration});
		sequence.loadingIndex = null;
		// 次の音声を先に読み込んでおく
		const next = sequence.audios[index + 1];
		if (next !== undefined) {
			this.load(next).catch(() => {});
		}
	}

	#tick(): void {
		const context = this.#context;
		const sequence = this.#sequence;
		if (!context || !sequence) return;
		const now = context.currentTime;

		const current = this.#tracks.findLast((t) => t.start <= now);
		if (current && current.index !== sequence.reportedIndex) {
			sequence.reportedIndex = current.index;
			sequence.callbacks.onTrack?.(current.index);
		}

		const last = this.#tracks.at(-1);
		if (!last || last.start > now || sequence.loadingIndex !== null) return;
		if (last.index + 1 < sequence.audios.length) {
			// 今の音声が鳴り始めたら、次の音声をその終わりに予約する
			void this.#schedule(sequence, last.index + 1, last.end + sequence.intervalSeconds);
		} else if (now >= last.end && !sequence.finished) {
			sequence.finished = true;
			this.stop();
			sequence.callbacks.onFinish?.();
		}

		// 鳴り終えた音声を片付ける (直前のものは位置の表示に使うので残す)
		while (this.#tracks.length > 2 && (this.#tracks[0] as ScheduledTrack).end < now) {
			this.#tracks.shift()?.source.disconnect();
		}
	}
}
