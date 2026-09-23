import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {DEFAULT_SERVER_PORT, DEV_CLIENT_PORT} from './src/shared/ports.ts';

const serverPort = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

export default defineConfig({
	plugins: [react()],
	root: 'src/client',
	publicDir: false,
	build: {
		outDir: '../../dist/client',
		emptyOutDir: true,
	},
	server: {
		// LAN 内の他端末からアクセスできるようにする
		host: true,
		port: DEV_CLIENT_PORT,
		// 別のポートに逃げると、サーバーが表示する URL と食い違うので失敗させる
		strictPort: true,
		proxy: {
			'/socket.io': {target: `http://localhost:${serverPort}`, ws: true},
			'/api': {target: `http://localhost:${serverPort}`},
		},
	},
	css: {
		modules: {localsConvention: 'camelCaseOnly'},
	},
});
