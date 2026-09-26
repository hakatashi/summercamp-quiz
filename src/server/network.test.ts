import {networkInterfaces} from 'node:os';
import {describe, expect, it, vi} from 'vitest';
import {getLanAddresses} from './network.ts';

vi.mock('node:os', () => ({
	networkInterfaces: vi.fn(),
}));

const mockInterfaces = (
	interfaces: Record<string, {address: string; family: string; internal: boolean}[]>,
) => {
	vi.mocked(networkInterfaces).mockReturnValue(
		// biome-ignore lint/suspicious/noExplicitAny: テスト用の簡易モック
		interfaces as any,
	);
};

describe('getLanAddresses', () => {
	it('IPv4 かつ内部アドレスでないものだけを返す', () => {
		mockInterfaces({
			lo: [{address: '127.0.0.1', family: 'IPv4', internal: true}],
			eth0: [{address: '192.168.1.10', family: 'IPv4', internal: false}],
			eth0v6: [{address: 'fe80::1', family: 'IPv6', internal: false}],
		});
		expect(getLanAddresses()).toEqual(['192.168.1.10']);
	});

	it('publicHost を指定すると、検出済みのアドレスでも先頭に持ってくる', () => {
		mockInterfaces({
			docker0: [{address: '172.17.0.1', family: 'IPv4', internal: false}],
			eth0: [{address: '192.168.1.10', family: 'IPv4', internal: false}],
		});
		expect(getLanAddresses('192.168.1.10')).toEqual(['192.168.1.10', '172.17.0.1']);
	});

	it('publicHost が検出済みのアドレスに含まれなくても、先頭に追加する', () => {
		mockInterfaces({
			eth0: [{address: '192.168.1.10', family: 'IPv4', internal: false}],
		});
		expect(getLanAddresses('10.0.0.5')).toEqual(['10.0.0.5', '192.168.1.10']);
	});
});
