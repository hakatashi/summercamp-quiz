import {useCallback, useEffect, useState} from 'react';
import type {SubscribeRequest} from '../../shared/protocol.ts';
import type {GameView} from '../../shared/types.ts';
import {REQUEST_TIMEOUT_MS, socket, unwrap} from './socket.ts';

export type Command = {type: string} & Record<string, unknown>;

export interface GameConnection<S> {
	view: GameView<S> | null;
	connected: boolean;
	/** 購読できなかった理由、または購読から外された理由 */
	error: string | null;
	participantId: string | null;
	send: (command: Command) => Promise<void>;
	undo: () => Promise<string>;
}

/**
 * ゲームを購読し、最新の状態を返す。再接続したら自動で購読し直す。
 * request が null のあいだは購読しない。
 */
export const useGame = <S>(request: SubscribeRequest | null): GameConnection<S> => {
	const [view, setView] = useState<GameView<S> | null>(null);
	const [connected, setConnected] = useState(socket.connected);
	const [error, setError] = useState<string | null>(null);
	const [participantId, setParticipantId] = useState<string | null>(null);

	const gameId = request?.gameId;
	const role = request?.role;
	const token = request?.token;
	const password = request?.password;

	useEffect(() => {
		if (gameId === undefined || role === undefined) {
			return;
		}
		let active = true;
		setView(null);
		setError(null);

		const subscribe = async () => {
			try {
				const response = await socket
					.timeout(REQUEST_TIMEOUT_MS)
					.emitWithAck('subscribe', {gameId, role, token, password});
				if (!active) return;
				const {participantId: id} = unwrap(response);
				setParticipantId(id);
				setError(null);
			} catch (e) {
				if (active) setError(e instanceof Error ? e.message : String(e));
			}
		};
		const onConnect = () => {
			setConnected(true);
			void subscribe();
		};
		const onDisconnect = () => setConnected(false);
		const onGame = (next: GameView) => {
			if (next.game.id !== gameId) return;
			// 遅れて届いた古い状態は捨てる
			setView((prev) => (prev && prev.version > next.version ? prev : (next as GameView<S>)));
		};
		const onKicked = (reason: string) => {
			setError(reason);
			setView(null);
		};

		socket.on('connect', onConnect);
		socket.on('disconnect', onDisconnect);
		socket.on('game', onGame);
		socket.on('kicked', onKicked);
		if (socket.connected) void subscribe();

		return () => {
			active = false;
			socket.off('connect', onConnect);
			socket.off('disconnect', onDisconnect);
			socket.off('game', onGame);
			socket.off('kicked', onKicked);
		};
	}, [gameId, role, token, password]);

	const send = useCallback(async (command: Command) => {
		unwrap(await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('command', command));
	}, []);

	const undo = useCallback(async () => {
		return unwrap(await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('undo')).undone;
	}, []);

	return {view, connected, error, participantId, send, undo};
};
