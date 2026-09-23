import {type ReactNode, useEffect, useState} from 'react';
import styles from './MonitorStage.module.css';

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

const computeScale = () =>
	Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);

/**
 * 1920×1080 固定のステージを、画面いっぱいに (縦横比を保って) 拡大縮小して表示する。
 * モニター画面の中身はこのステージの座標系 (px) で組めばよい。
 */
export const MonitorStage = ({children}: {children: ReactNode}) => {
	const [scale, setScale] = useState(computeScale);

	useEffect(() => {
		const onResize = () => setScale(computeScale());
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	return (
		<div className={styles.viewport}>
			<div
				className={styles.stage}
				style={{width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})`}}
			>
				{children}
			</div>
		</div>
	);
};
