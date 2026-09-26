import buzzerUrl from '../sounds/buzzer.mp3';
import correctUrl from '../sounds/correct.mp3';
import timeupUrl from '../sounds/timeup.mp3';
import wrongUrl from '../sounds/wrong.mp3';

export type SoundEffect = 'buzzer' | 'correct' | 'wrong' | 'timeup';

const urls: Record<SoundEffect, string> = {
	buzzer: buzzerUrl,
	correct: correctUrl,
	wrong: wrongUrl,
	timeup: timeupUrl,
};

let context: AudioContext | null = null;
const buffers = new Map<SoundEffect, Promise<AudioBuffer>>();
const listeners = new Set<() => void>();

const notify = () => {
	for (const listener of listeners) listener();
};

/** 画面のどこかを操作したら、自動再生の制限を解除する */
const resumeOnGesture = () => {
	void context?.resume();
};

const getContext = (): AudioContext => {
	if (context) return context;
	context = new AudioContext();
	context.addEventListener('statechange', notify);
	for (const type of ['pointerdown', 'keydown'] as const) {
		window.addEventListener(type, resumeOnGesture, {capture: true});
	}
	notify();
	return context;
};

const load = (effect: SoundEffect): Promise<AudioBuffer> => {
	const cached = buffers.get(effect);
	if (cached) return cached;
	const audioContext = getContext();
	const promise = fetch(urls[effect])
		.then((response) => {
			if (!response.ok) {
				throw new Error(`効果音を読み込めませんでした (${response.status})`);
			}
			return response.arrayBuffer();
		})
		.then((data) => audioContext.decodeAudioData(data));
	promise.catch(() => buffers.delete(effect));
	buffers.set(effect, promise);
	return promise;
};

/** 効果音を読み込んでおく。再生の制限もこの時点で解除を試みる */
export const preloadSoundEffects = () => {
	void getContext().resume();
	for (const effect of Object.keys(urls) as SoundEffect[]) {
		load(effect).catch(() => {});
	}
};

export const playSoundEffect = async (effect: SoundEffect) => {
	const audioContext = getContext();
	const buffer = await load(effect);
	const source = audioContext.createBufferSource();
	source.buffer = buffer;
	source.connect(audioContext.destination);
	source.onended = () => source.disconnect();
	source.start();
};

/** 自動再生の制限で音が鳴らない状態か */
export const isSoundBlocked = () => context !== null && context.state !== 'running';

export const subscribeSoundState = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
