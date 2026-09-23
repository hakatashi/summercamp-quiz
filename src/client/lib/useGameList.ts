import {useEffect, useState} from 'react';
import type {GameSummary} from '../../shared/types.ts';
import {REQUEST_TIMEOUT_MS, socket, unwrap} from './socket.ts';

/** ゲーム一覧。変更があれば取り直す */
export const useGameList = () => {
	const [games, setGames] = useState<GameSummary[] | null>(null);

	useEffect(() => {
		let active = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const load = async () => {
			try {
				const response = await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('listGames');
				if (active) setGames(unwrap(response).games);
			} catch {
				// 再接続時に取り直す
			}
		};
		// 早押し中などは変更通知が頻繁に来るので、まとめて取り直す
		const onChanged = () => {
			clearTimeout(timer);
			timer = setTimeout(load, 300);
		};
		if (socket.connected) void load();
		socket.on('connect', load);
		socket.on('gamesChanged', onChanged);
		return () => {
			active = false;
			clearTimeout(timer);
			socket.off('connect', load);
			socket.off('gamesChanged', onChanged);
		};
	}, []);

	return games;
};
