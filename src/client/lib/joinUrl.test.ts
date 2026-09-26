import {describe, expect, it} from 'vitest';
import {buildJoinUrl} from './joinUrl.ts';

describe('buildJoinUrl', () => {
	it('検出したアドレスの先頭を使って参加用 URL を組み立てる', () => {
		const url = buildJoinUrl(
			{addresses: ['192.168.1.10', '172.17.0.1'], port: 38421},
			'game-1',
			'http://localhost:38421',
		);
		expect(url).toBe('http://192.168.1.10:38421/games/game-1/play');
	});

	it('アドレスが1件もなければ fallbackOrigin を使う', () => {
		const url = buildJoinUrl({addresses: [], port: 38421}, 'game-1', 'http://localhost:38421');
		expect(url).toBe('http://localhost:38421/games/game-1/play');
	});
});
