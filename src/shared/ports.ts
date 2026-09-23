/**
 * 既定のポート番号。他のアプリとぶつかりにくいよう、よく使われる番号 (3000, 5173 など) は避けている。
 * サーバーのポートは環境変数 PORT で上書きできる。
 */
export const DEFAULT_SERVER_PORT = 38421;

/** 開発時に Vite が使うポート */
export const DEV_CLIENT_PORT = 47352;
