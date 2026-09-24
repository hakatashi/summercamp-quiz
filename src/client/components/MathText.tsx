import katex from 'katex';
import 'katex/dist/katex.min.css';
import {type CSSProperties, useMemo} from 'react';
import {splitMath} from '../lib/math.ts';
import styles from './MathText.module.css';

/**
 * 複数行の文章を、`$...$` / `$$...$$` の数式を KaTeX で描画しながら表示する。
 * 書き間違えた数式はエラーにせず、赤字で原文を表示する。
 */
export const MathText = ({
	text,
	className,
	style,
}: {
	text: string;
	className?: string | undefined;
	style?: CSSProperties | undefined;
}) => {
	const segments = useMemo(
		() =>
			splitMath(text).map((segment) =>
				segment.type === 'text'
					? segment
					: {
							...segment,
							html: katex.renderToString(segment.value, {
								displayMode: segment.display,
								throwOnError: false,
								output: 'html',
							}),
						},
			),
		[text],
	);

	return (
		<div className={className ? `${styles.text} ${className}` : styles.text} style={style}>
			{segments.map((segment, index) =>
				segment.type === 'text' ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: 文章の分割結果で、並びは text から一意に決まる
					<span key={index}>{segment.value}</span>
				) : (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: 文章の分割結果で、並びは text から一意に決まる
						key={index}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX (trust: false) が生成した HTML
						dangerouslySetInnerHTML={{__html: segment.html}}
					/>
				),
			)}
		</div>
	);
};
