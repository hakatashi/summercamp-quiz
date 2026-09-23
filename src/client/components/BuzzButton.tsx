import {useEffect, useRef} from 'react';
import type {BuzzDiag} from '../../shared/buzz.ts';
import {clockStatus, eventEpoch, toServerTime} from '../lib/clock.ts';
import styles from './BuzzButton.module.css';

interface Props {
	/** 押せる状態か */
	enabled: boolean;
	/** この値が変わると、もう一度押せるようになる (問題が変わったときなど) */
	armKey: string;
	label: string;
	/** 押した時刻 (サーバー時刻) を受け取る。失敗したら reject すると、もう一度押せるようになる */
	onPress: (pressedAt: number, diag?: BuzzDiag) => Promise<void>;
}

const isTypingTarget = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * 早押しボタン。遅延を減らすため、タッチは touchstart、マウスは pointerdown、
 * キーボードは Enter / Space の keydown で押した瞬間の時刻を取る。
 */
export const BuzzButton = ({enabled, armKey, label, onPress}: Props) => {
	const buttonRef = useRef<HTMLButtonElement>(null);
	const pressedRef = useRef(false);
	const latest = useRef({enabled, onPress});
	latest.current = {enabled, onPress};

	// biome-ignore lint/correctness/useExhaustiveDependencies: armKey が変わったら押せる状態に戻す
	useEffect(() => {
		pressedRef.current = false;
	}, [armKey]);

	useEffect(() => {
		const button = buttonRef.current;
		if (!button) return;

		const fire = (event: Event) => {
			const {enabled, onPress} = latest.current;
			if (!enabled || pressedRef.current) return;
			pressedRef.current = true;
			const pressedAt = toServerTime(eventEpoch(event));
			const status = clockStatus();
			const diag = status.rtt !== null ? {rtt: status.rtt, offset: status.offset} : undefined;
			navigator.vibrate?.(40);
			onPress(pressedAt, diag).catch(() => {
				pressedRef.current = false;
			});
		};
		const onTouchStart = (event: TouchEvent) => {
			// ダブルタップでの拡大や、後続のマウスイベントを防ぐ
			event.preventDefault();
			fire(event);
		};
		const onPointerDown = (event: PointerEvent) => {
			if (event.pointerType === 'touch') return; // touchstart で処理する
			if (event.button !== 0) return;
			fire(event);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.repeat || isTypingTarget(event.target)) return;
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			fire(event);
		};

		button.addEventListener('touchstart', onTouchStart, {passive: false});
		button.addEventListener('pointerdown', onPointerDown);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			button.removeEventListener('touchstart', onTouchStart);
			button.removeEventListener('pointerdown', onPointerDown);
			window.removeEventListener('keydown', onKeyDown);
		};
	}, []);

	return (
		<button
			ref={buttonRef}
			type="button"
			className={styles.button}
			aria-disabled={!enabled}
			data-enabled={enabled}
			// クリックでの二重発火を防ぐため、押下は上のイベントだけで扱う
			onClick={(event) => event.preventDefault()}
			onContextMenu={(event) => event.preventDefault()}
		>
			<span className={styles.label}>{label}</span>
		</button>
	);
};
