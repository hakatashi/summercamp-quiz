import type {ServerInfo} from '../../shared/serverInfo.ts';

export const fetchServerInfo = async (): Promise<ServerInfo> => {
	const res = await fetch('/api/info');
	if (!res.ok) {
		throw new Error('サーバー情報の取得に失敗しました');
	}
	return (await res.json()) as ServerInfo;
};
