import type {ReactNode} from 'react';
import {Link} from 'react-router';
import type {SubscribeRequest} from '../../shared/protocol.ts';
import {useGame} from '../lib/useGame.ts';
import type {ScreenProps} from '../modes/types.ts';
import styles from './Page.module.css';

interface Props {
	request: SubscribeRequest;
	children: (props: ScreenProps<unknown>) => ReactNode;
	/** 購読に失敗したときの表示を差し替える (参加者の再登録など) */
	renderError?: (error: string) => ReactNode;
}

/** ゲームを購読し、読み込み中・エラー・切断の表示をまとめて扱う */
export const GameScreen = ({request, children, renderError}: Props) => {
	const {view, ...rest} = useGame<unknown>(request);

	if (rest.error) {
		return (
			renderError?.(rest.error) ?? (
				<div className={styles.center}>
					<p className={styles.error}>{rest.error}</p>
					<Link to="/">トップへ</Link>
				</div>
			)
		);
	}
	if (!view) {
		return (
			<div className={styles.center}>
				<p className={styles.muted}>{rest.connected ? '読み込み中…' : 'サーバーに接続中…'}</p>
			</div>
		);
	}
	return (
		<>
			{!rest.connected && <div className={styles.banner}>接続が切れました。再接続しています…</div>}
			{children({view, ...rest})}
		</>
	);
};

export const Unsupported = ({screen}: {screen: string}) => (
	<div className={styles.center}>
		<p>この企画には{screen}がありません。</p>
		<Link to="/">トップへ</Link>
	</div>
);
