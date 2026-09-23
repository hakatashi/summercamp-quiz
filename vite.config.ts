import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

const serverPort = Number(process.env['PORT'] ?? 3000);

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
		port: 5173,
		proxy: {
			'/socket.io': {target: `http://localhost:${serverPort}`, ws: true},
			'/api': {target: `http://localhost:${serverPort}`},
		},
	},
	css: {
		modules: {localsConvention: 'camelCaseOnly'},
	},
});
