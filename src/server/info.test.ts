import {afterEach, describe, expect, it} from 'vitest';
import type {ServerInfo} from '../shared/serverInfo.ts';
import {createApp} from './app.ts';

describe('GET /api/info', () => {
	let app: ReturnType<typeof createApp>;
	let url: string;

	afterEach(async () => {
		await app.close();
	});

	it('publicPort を指定しなければ、実際に listen したポートを返す', async () => {
		app = createApp({dbPath: ':memory:', hostPassword: 'secret'});
		const port = await app.listen(0, '127.0.0.1');
		url = `http://127.0.0.1:${port}`;

		const res = await fetch(`${url}/api/info`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as ServerInfo;
		expect(body.port).toBe(port);
		expect(Array.isArray(body.addresses)).toBe(true);
	});

	it('publicPort を指定すると、そのポートを返す (開発時の Vite ポートなど)', async () => {
		app = createApp({dbPath: ':memory:', hostPassword: 'secret', publicPort: 5173});
		const port = await app.listen(0, '127.0.0.1');
		url = `http://127.0.0.1:${port}`;

		const res = await fetch(`${url}/api/info`);
		const body = (await res.json()) as ServerInfo;
		expect(body.port).toBe(5173);
	});

	it('publicHost を指定すると、先頭のアドレスになる', async () => {
		app = createApp({dbPath: ':memory:', hostPassword: 'secret', publicHost: '203.0.113.5'});
		const port = await app.listen(0, '127.0.0.1');
		url = `http://127.0.0.1:${port}`;

		const res = await fetch(`${url}/api/info`);
		const body = (await res.json()) as ServerInfo;
		expect(body.addresses[0]).toBe('203.0.113.5');
	});
});
