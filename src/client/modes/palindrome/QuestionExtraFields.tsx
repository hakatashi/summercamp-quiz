import {useMemo} from 'react';
import {generateCharTypes, getCharTypesHint} from '../../../shared/modes/palindrome/charTypes.ts';
import type {PalindromeQuestionExtra} from '../../../shared/modes/palindrome/types.ts';
import {
	isPalindromeRelaxed,
	normalizeAnswerText,
} from '../../../shared/modes/palindrome/validation.ts';
import {MediaInput} from '../../components/MediaInput.tsx';
import type {QuestionExtraFieldsProps} from '../types.ts';
import styles from './QuestionExtraFields.module.css';

export const QuestionExtraFields = ({value, onChange, answer = ''}: QuestionExtraFieldsProps) => {
	const extra = useMemo<Partial<PalindromeQuestionExtra>>(() => {
		const raw = (value ?? {}) as Record<string, unknown>;
		return {
			image: typeof raw.image === 'string' ? raw.image : '',
			notation: typeof raw.notation === 'string' ? raw.notation : '',
			altAnswers: Array.isArray(raw.altAnswers)
				? raw.altAnswers.filter((a): a is string => typeof a === 'string')
				: [],
			hints:
				typeof raw.hints === 'object' && raw.hints !== null
					? (raw.hints as PalindromeQuestionExtra['hints'])
					: {situation: '', irasutoya: ''},
		};
	}, [value]);

	const updateExtra = (patch: Partial<PalindromeQuestionExtra>) => {
		onChange({
			...value,
			...patch,
			hints: {
				...(extra.hints ?? {situation: '', irasutoya: ''}),
				...(patch.hints ?? {}),
			},
		});
	};

	// 答えの検証状況
	const answerFeedback = useMemo(() => {
		const normalized = normalizeAnswerText(answer);
		if (!normalized) {
			return {valid: false, message: '答えを入力してください'};
		}
		const isHiragana = /^[\u3041-\u3096ー]+$/.test(normalized);
		if (!isHiragana) {
			return {valid: false, message: 'ひらがなで入力してください'};
		}
		const isPal = isPalindromeRelaxed(normalized);
		const len = [...normalized].length;
		if (!isPal) {
			return {valid: false, message: `回文になっていません (${len} 文字)`};
		}
		return {valid: true, message: `回文判定OK (${len} 文字)`};
	}, [answer]);

	const autoCharTypes = useMemo(() => generateCharTypes(extra.notation ?? ''), [extra.notation]);

	const effectiveCharTypes = useMemo(
		() => getCharTypesHint(extra.notation ?? '', extra.hints?.charTypes),
		[extra.notation, extra.hints?.charTypes],
	);

	const handleAltAnswersChange = (text: string) => {
		const list = text
			.split('\n')
			.map((s) => normalizeAnswerText(s))
			.filter(Boolean);
		updateExtra({altAnswers: list});
	};

	return (
		<div className={styles.container}>
			<div className={styles.field}>
				<span className={styles.fieldLabel}>答えの回文判定・文字数</span>
				<div className={styles.answerStatus}>
					<span className={answerFeedback.valid ? styles.statusValid : styles.statusInvalid}>
						{answerFeedback.valid ? '✓' : '⚠'} {answerFeedback.message}
					</span>
				</div>
			</div>

			<div className={styles.field}>
				<MediaInput
					type="image"
					label="回文イラスト"
					value={extra.image || undefined}
					onChange={(mediaId) => updateExtra({image: mediaId ?? ''})}
				/>
			</div>

			<div className={styles.field}>
				<label className={styles.fieldLabel} htmlFor="palindrome-notation">
					表記 (漢字・カタカナ混じりの自然な表記)
				</label>
				<input
					id="palindrome-notation"
					type="text"
					value={extra.notation ?? ''}
					onChange={(e) => updateExtra({notation: e.target.value})}
					placeholder="例: 枕から熊"
					required
				/>
				<div className={styles.hintText}>
					文字種ヒントの元になり、終了後にモニターや解説に表示されます。
				</div>
			</div>

			<div className={styles.field}>
				<label className={styles.fieldLabel} htmlFor="palindrome-chartypes">
					文字種ヒント (自動生成プレビュー & 手動上書き)
				</label>
				<div className={styles.row}>
					<span className={styles.hintText}>自動生成:</span>
					<span className={styles.previewBadge}>{autoCharTypes || '(未入力)'}</span>
					{extra.hints?.charTypes && (
						<>
							<span className={styles.hintText}>適用中 (手動):</span>
							<span className={styles.previewBadge}>{effectiveCharTypes}</span>
						</>
					)}
				</div>
				<input
					id="palindrome-chartypes"
					type="text"
					value={extra.hints?.charTypes ?? ''}
					onChange={(e) =>
						updateExtra({
							hints: {
								situation: extra.hints?.situation ?? '',
								irasutoya: extra.hints?.irasutoya ?? '',
								charTypes: e.target.value || undefined,
							},
						})
					}
					placeholder="手動で上書きする場合のみ入力 (例: 漢ああ漢)"
				/>
				<div className={styles.hintText}>
					空欄の場合は上記の「自動生成」の文字種ヒントが使われます。
				</div>
			</div>

			<div className={styles.field}>
				<label className={styles.fieldLabel} htmlFor="palindrome-situation">
					状況説明ヒント
				</label>
				<textarea
					id="palindrome-situation"
					value={extra.hints?.situation ?? ''}
					onChange={(e) =>
						updateExtra({
							hints: {
								irasutoya: extra.hints?.irasutoya ?? '',
								charTypes: extra.hints?.charTypes,
								situation: e.target.value,
							},
						})
					}
					rows={2}
					placeholder="例: 動物がある寝具から出てきているようです。"
					required
				/>
			</div>

			<div className={styles.field}>
				<label className={styles.fieldLabel} htmlFor="palindrome-irasutoya">
					いらすとやヒント
				</label>
				<textarea
					id="palindrome-irasutoya"
					value={extra.hints?.irasutoya ?? ''}
					onChange={(e) =>
						updateExtra({
							hints: {
								situation: extra.hints?.situation ?? '',
								charTypes: extra.hints?.charTypes,
								irasutoya: e.target.value,
							},
						})
					}
					rows={2}
					placeholder="例: 「枕のイラスト」、「熊のキャラクター（四つ足）」が使われています。"
					required
				/>
			</div>

			<div className={styles.field}>
				<label className={styles.fieldLabel} htmlFor="palindrome-altanswers">
					別解 (ひらがなの回文、改行区切りで複数指定可)
				</label>
				<textarea
					id="palindrome-altanswers"
					value={(extra.altAnswers ?? []).join('\n')}
					onChange={(e) => handleAltAnswersChange(e.target.value)}
					rows={2}
					placeholder="1行に1つ入力 (例: まくらからのくま)"
				/>
			</div>
		</div>
	);
};
