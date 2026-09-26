import {toDataURL} from 'qrcode';
import {useEffect, useState} from 'react';
import {buildJoinUrl} from '../lib/joinUrl.ts';
import {fetchServerInfo} from '../lib/serverInfo.ts';
import styles from './JoinQrCode.module.css';

interface Props {
	gameId: string;
	/** QR コード画像の一辺のサイズ (px) */
	size?: number;
}

/**
 * 参加用 URL の QR コードを表示する。外部の QR 生成 API は使わず、qrcode ライブラリでオフライン生成する。
 * LAN の IP アドレスはクライアントからは分からないので、サーバーの /api/info から取得する
 */
export const JoinQrCode = ({gameId, size = 240}: Props) => {
	const [result, setResult] = useState<{url: string; dataUrl: string} | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setResult(null);
		setError(null);
		(async () => {
			try {
				const info = await fetchServerInfo();
				const url = buildJoinUrl(info, gameId, window.location.origin);
				const dataUrl = await toDataURL(url, {margin: 1, width: size});
				if (!cancelled) {
					setResult({url, dataUrl});
				}
			} catch {
				if (!cancelled) {
					setError('QR コードの生成に失敗しました');
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [gameId, size]);

	if (error) {
		return <p className={styles.message}>{error}</p>;
	}
	if (!result) {
		return <p className={styles.message}>読み込み中…</p>;
	}

	return (
		<div className={styles.container}>
			<img
				className={styles.image}
				src={result.dataUrl}
				alt="参加用 QR コード"
				width={size}
				height={size}
			/>
			<p className={styles.url}>{result.url}</p>
		</div>
	);
};
