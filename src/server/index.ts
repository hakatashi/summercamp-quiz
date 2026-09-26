import {resolve} from 'node:path';
import {DEFAULT_SERVER_PORT, DEV_CLIENT_PORT} from '../shared/ports.ts';
import {createApp} from './app.ts';
import {getLanAddresses} from './network.ts';

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
const dataDir = resolve(process.env.DATA_DIR ?? 'data');
const publicHost = process.env.PUBLIC_HOST;
// 開発時は Vite 経由でアクセスする
const publicPort = production ? port : DEV_CLIENT_PORT;

const app = createApp({
	dbPath: resolve(dataDir, 'quiz.sqlite'),
	mediaDir: resolve(dataDir, 'media'),
	hostPassword: process.env.HOST_PASSWORD ?? '',
	clientDir: production ? resolve('dist/client') : undefined,
	publicHost,
	publicPort,
});

await app.listen(port, '0.0.0.0');

console.log(`サーバーを起動しました (port ${port})`);
console.log('LAN 内からは次の URL でアクセスできます:');
for (const address of getLanAddresses(publicHost)) {
	console.log(`  http://${address}:${publicPort}/`);
}
if (!process.env.HOST_PASSWORD) {
	console.log('注意: HOST_PASSWORD が未設定なので、誰でも司会者画面を開けます');
}

const shutdown = async () => {
	await app.close();
	process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
