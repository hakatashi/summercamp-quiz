import type {ServerInfo} from '../../shared/serverInfo.ts';

/**
 * 参加者が開くべき URL を組み立てる。
 * サーバーが LAN アドレスを検出できなかった場合は、いま見ている画面の origin にフォールバックする
 * (それでも同一 LAN 内の別端末からアクセスできるとは限らないが、何も出さないよりはよい)
 */
export const buildJoinUrl = (info: ServerInfo, gameId: string, fallbackOrigin: string): string => {
	const address = info.addresses[0];
	const origin = address ? `http://${address}:${info.port}` : fallbackOrigin;
	return `${origin}/games/${gameId}/play`;
};
