import {type BuzzerSoundRecord, useBuzzerSounds} from '../lib/buzzerSounds.ts';
import styles from './BuzzerSounds.module.css';

/**
 * 早押し系のモニター画面で、ボタン押下・正誤判定・スルーの効果音を鳴らす。
 * 自動再生の制限で鳴らせないときは、画面の隅に案内を出す
 */
export const BuzzerSounds = ({record}: {record: BuzzerSoundRecord | null}) => {
	const blocked = useBuzzerSounds(record);
	return blocked ? (
		<div className={styles.notice}>🔇 画面をクリックすると効果音が鳴るようになります</div>
	) : null;
};
