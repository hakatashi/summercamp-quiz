import {io, type Socket} from 'socket.io-client';
import type {ClientToServerEvents, ServerToClientEvents} from '../../shared/protocol.ts';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** アプリ全体で共有する接続。開発時は Vite の proxy 経由でサーバーにつながる */
export const socket: AppSocket = io({
	transports: ['websocket', 'polling'],
	reconnectionDelay: 500,
	reconnectionDelayMax: 3000,
});

export const REQUEST_TIMEOUT_MS = 8000;

/** ack の結果が ok: false なら例外にする */
export const unwrap = <T extends {ok: boolean}>(response: T): Extract<T, {ok: true}> => {
	if (!response.ok) {
		throw new Error((response as unknown as {error: string}).error);
	}
	return response as Extract<T, {ok: true}>;
};
