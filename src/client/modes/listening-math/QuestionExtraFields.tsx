import {useId} from 'react';
import type {ListeningMathQuestionExtra} from '../../../shared/modes/listening-math/index.ts';
import {MathText} from '../../components/MathText.tsx';
import {MediaInput} from '../../components/MediaInput.tsx';
import type {QuestionExtraFieldsProps} from '../types.ts';
import styles from './QuestionExtraFields.module.css';

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

export const QuestionExtraFields = ({value, onChange}: QuestionExtraFieldsProps) => {
	const id = useId();
	const extra: ListeningMathQuestionExtra = {
		audio: asString(value.audio),
		explanation: asString(value.explanation),
		source: asString(value.source),
	};
	const update = (patch: Partial<ListeningMathQuestionExtra>) => onChange({...extra, ...patch});

	return (
		<div className={styles.container}>
			<MediaInput
				type="audio"
				label="問題音声"
				value={extra.audio || undefined}
				onChange={(audio) => update({audio: audio ?? ''})}
			/>
			{!extra.audio && <p className={styles.warning}>音声を登録しないと出題できません</p>}

			<div className={styles.field}>
				<label htmlFor={`${id}-explanation`}>解説 (振り返りでモニターに表示。複数行可)</label>
				<textarea
					id={`${id}-explanation`}
					value={extra.explanation}
					onChange={(event) => update({explanation: event.target.value})}
					rows={4}
					placeholder={'例: 両辺を 2 乗すると $x^2 = 4$ となるので、$x = \\pm 2$'}
				/>
				<span className={styles.hint}>
					数式は Markdown と同じく <code>$...$</code> (文中) と <code>$$...$$</code> (独立した行) で
					TeX 記法を書けます。<code>\$</code> でただの $ になります。
				</span>
				{extra.explanation && (
					<div className={styles.preview}>
						<span className={styles.previewLabel}>プレビュー</span>
						<MathText text={extra.explanation} />
					</div>
				)}
			</div>

			<div className={styles.field}>
				<label htmlFor={`${id}-source`}>出典 (振り返りでモニターに小さく表示)</label>
				<input
					id={`${id}-source`}
					value={extra.source}
					onChange={(event) => update({source: event.target.value})}
					placeholder="例: オリジナル、2019 AMC 12A Problem 19 (改)"
					maxLength={200}
				/>
			</div>
		</div>
	);
};
