import {networkInterfaces} from 'node:os';

/**
 * LAN 内から到達可能な IPv4 アドレスの一覧を返す。
 * Docker のブリッジアドレス (172.17.0.0/16 など) が混ざって参加者が誤ったアドレスを掴むことがあるので、
 * publicHost (環境変数 PUBLIC_HOST) を指定すると、そのアドレスを先頭に置く
 */
export const getLanAddresses = (publicHost?: string): string[] => {
	const detected = Object.values(networkInterfaces())
		.flat()
		.filter((info) => info !== undefined && info.family === 'IPv4' && !info.internal)
		.map((info) => info?.address as string);

	if (!publicHost) {
		return detected;
	}
	return [publicHost, ...detected.filter((address) => address !== publicHost)];
};
