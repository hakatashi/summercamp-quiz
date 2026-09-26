import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import type {Server as HttpServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {dirname, join} from 'node:path';
import {createAdaptorServer} from '@hono/node-server';
import {serveStatic} from '@hono/node-server/serve-static';
import {Hono} from 'hono';
import {Database} from './db.ts';
import {GameManager} from './gameManager.ts';
import {createMediaRouter} from './media.ts';
import {getLanAddresses} from './network.ts';
import {attachSocketServer} from './socket.ts';

export interface AppOptions {
	/** SQLite のファイルパス。':memory:' ならメモリ上 */
	dbPath: string;
	hostPassword: string;
	/** メディアファイルの保存先ディレクトリ。未指定の場合は data/media */
	mediaDir?: string | undefined;
	/** ビルド済みクライアントのディレクトリ。指定するとそこから静的配信する */
	clientDir?: string | undefined;
	/** 参加用 URL に優先して使うアドレス (環境変数 PUBLIC_HOST) */
	publicHost?: string | undefined;
	/** 参加者が接続すべきポート (省略時は実際に listen したポート) */
	publicPort?: number | undefined;
}

export const createApp = (options: AppOptions) => {
	const db = new Database(options.dbPath);
	const manager = new GameManager(db);

	const app = new Hono();
	app.get('/api/health', (c) => c.json({ok: true}));

	const mediaDir =
		options.mediaDir ??
		(options.dbPath === ':memory:'
			? join(process.cwd(), 'data', 'media')
			: join(dirname(options.dbPath), 'media'));
	app.route('/api/media', createMediaRouter({db, mediaDir, hostPassword: options.hostPassword}));

	const httpServer = createAdaptorServer({fetch: app.fetch}) as HttpServer;
	const io = attachSocketServer(httpServer, manager, {hostPassword: options.hostPassword});

	// clientDir 配下の静的配信より前に登録する (でないと catch-all に奪われる)
	app.get('/api/info', (c) => {
		const listening = httpServer.address();
		const port = options.publicPort ?? (typeof listening === 'object' ? (listening?.port ?? 0) : 0);
		return c.json({addresses: getLanAddresses(options.publicHost), port});
	});

	const {clientDir} = options;
	if (clientDir && existsSync(clientDir)) {
		app.use('/*', serveStatic({root: clientDir}));
		// SPA なので、存在しないパスには index.html を返す
		app.get('*', async (c) => c.html(await readFile(join(clientDir, 'index.html'), 'utf8')));
	}

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
