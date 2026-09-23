import {networkInterfaces} from 'node:os';
import {resolve} from 'node:path';
import {createApp} from './app.ts';

const production = process.env['NODE_ENV'] === 'production';
const port = Number(process.env['PORT'] ?? 3000);
const dataDir = resolve(process.env['DATA_DIR'] ?? 'data');

const app = createApp({
	dbPath: resolve(dataDir, 'quiz.sqlite'),
	hostPassword: process.env['HOST_PASSWORD'] ?? '',
	clientDir: production ? resolve('dist/client') : undefined,
});

await app.listen(port, '0.0.0.0');

// 開発時は Vite (5173) 経由でアクセスする
const publicPort = production ? port : 5173;
const addresses = Object.values(networkInterfaces())
	.flat()
	.filter((info) => info && info.family === 'IPv4' && !info.internal)
	.map((info) => `http://${info?.address}:${publicPort}/`);

console.log(`サーバーを起動しました (port ${port})`);
console.log('LAN 内からは次の URL でアクセスできます:');
for (const address of addresses) {
	console.log(`  ${address}`);
}
if (!process.env['HOST_PASSWORD']) {
	console.log('注意: HOST_PASSWORD が未設定なので、誰でも司会者画面を開けます');
}

const shutdown = async () => {
	await app.close();
	process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
