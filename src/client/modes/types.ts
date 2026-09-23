import type {ComponentType} from 'react';
import type {Question} from '../../shared/types.ts';
import type {GameConnection} from '../lib/useGame.ts';

/** 各画面に渡す props。view は null でないことが保証される */
export type ScreenProps<S> = Omit<GameConnection<S>, 'view'> & {
	view: NonNullable<GameConnection<S>['view']>;
};

export interface QuestionExtraFieldsProps {
	value: Question['extra'];
	onChange: (extra: Question['extra']) => void;
}

/** 企画ごとのクライアント側の画面 */
export interface ModeScreens<S = unknown> {
	/** 司会者画面 (不要な企画では省略) */
	Host?: ComponentType<ScreenProps<S>>;
	/** 参加者画面 (不要な企画では省略) */
	Participant?: ComponentType<ScreenProps<S>>;
	/** モニター画面。1920×1080 のステージの中に描画される */
	Monitor?: ComponentType<ScreenProps<S>>;
	/** 問題編集画面で、企画固有の追加フィールドを編集する部品 (省略可) */
	QuestionExtraFields?: ComponentType<QuestionExtraFieldsProps>;
}
