/** GET /api/info のレスポンス。クライアントが参加用 URL の QR コードを組み立てるのに使う */
export interface ServerInfo {
	/** LAN からアクセス可能な IPv4 アドレスの一覧 (優先順)。1件も見つからないこともある */
	addresses: string[];
	/** 参加者が接続すべきポート */
	port: number;
}
