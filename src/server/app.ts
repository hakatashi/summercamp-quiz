import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import type {Server as HttpServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {join} from 'node:path';
import {createAdaptorServer} from '@hono/node-server';
import {serveStatic} from '@hono/node-server/serve-static';
import {Hono} from 'hono';
import {Database} from './db.ts';
import {GameManager} from './gameManager.ts';
import {attachSocketServer} from './socket.ts';

export interface AppOptions {
	/** SQLite のファイルパス。':memory:' ならメモリ上 */
	dbPath: string;
	hostPassword: string;
	/** ビルド済みクライアントのディレクトリ。指定するとそこから静的配信する */
	clientDir?: string | undefined;
}

export const createApp = (options: AppOptions) => {
	const db = new Database(options.dbPath);
	const manager = new GameManager(db);

	const app = new Hono();
	app.get('/api/health', (c) => c.json({ok: true}));

	const {clientDir} = options;
	if (clientDir && existsSync(clientDir)) {
		app.use('/*', serveStatic({root: clientDir}));
		// SPA なので、存在しないパスには index.html を返す
		app.get('*', async (c) => c.html(await readFile(join(clientDir, 'index.html'), 'utf8')));
	}

	const httpServer = createAdaptorServer({fetch: app.fetch}) as HttpServer;
	const io = attachSocketServer(httpServer, manager, {hostPassword: options.hostPassword});

	return {
		manager,
		httpServer,
		listen(port: number, host?: string) {
			return new Promise<number>((resolve) => {
				httpServer.listen(port, host, () => {
					resolve((httpServer.address() as AddressInfo).port);
				});
			});
		},
		async close() {
			await io.close();
			db.close();
		},
	};
};
