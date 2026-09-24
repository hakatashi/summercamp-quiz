import {type FormEvent, useMemo, useRef, useState} from 'react';
import {Link, useParams} from 'react-router';
import type {QuestionInput} from '../../shared/commands.ts';
import {modes} from '../../shared/modes/registry.ts';
import {getExportFileName, parseQuestionsJson} from '../../shared/questionsJson.ts';
import {convertTsvRowsToQuestions, parseTsv, type TsvExtraColumn} from '../../shared/tsv.ts';
import type {Question} from '../../shared/types.ts';
import {HostGate} from '../components/HostGate.tsx';
import {useNotify, useRun} from '../components/Toast.tsx';
import {screens} from '../modes/registry.ts';
import type {ScreenProps} from '../modes/types.ts';
import styles from './EditPage.module.css';
import {GameScreen} from './GameScreen.tsx';
import pageStyles from './Page.module.css';

interface Draft {
	text: string;
	answer: string;
	note: string;
	extra: Question['extra'];
}

const emptyDraft: Draft = {text: '', answer: '', note: '', extra: {}};

const QuestionForm = ({
	mode,
	initial,
	submitLabel,
	onSubmit,
	onCancel,
}: {
	mode: ScreenProps<unknown>['view']['game']['mode'];
	initial: Draft;
	submitLabel: string;
	onSubmit: (draft: Draft) => Promise<boolean>;
	onCancel?: () => void;
}) => {
	const [draft, setDraft] = useState(initial);
	const ExtraFields = screens[mode].QuestionExtraFields;

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (await onSubmit(draft)) {
			setDraft(initial);
		}
	};

	return (
		<form className={styles.form} onSubmit={submit}>
			<label>
				問題文{mode === 'palindrome' ? ' (イラスト問題のため省略可)' : ''}
				<textarea
					value={draft.text}
					onChange={(event) => setDraft({...draft, text: event.target.value})}
					rows={mode === 'palindrome' ? 1 : 3}
					required={mode !== 'palindrome'}
				/>
			</label>
			<label>
				答え
				<input
					value={draft.answer}
					onChange={(event) => setDraft({...draft, answer: event.target.value})}
					required
				/>
			</label>
			<label>
				メモ (別解、読み方など。司会者だけに表示)
				<input
					value={draft.note}
					onChange={(event) => setDraft({...draft, note: event.target.value})}
				/>
			</label>
			{ExtraFields && (
				<ExtraFields
					value={draft.extra}
					onChange={(extra) => setDraft({...draft, extra})}
					answer={draft.answer}
					onAnswerChange={(answer) => setDraft({...draft, answer})}
				/>
			)}
			<div className={pageStyles.row}>
				<button type="submit">{submitLabel}</button>
				{onCancel && (
					<button type="button" onClick={onCancel}>
						キャンセル
					</button>
				)}
			</div>
		</form>
	);
};

const ImportTsvForm = ({
	send,
	tsvExtraColumns,
}: {
	send: ScreenProps<unknown>['send'];
	tsvExtraColumns?: TsvExtraColumn[];
}) => {
	const [text, setText] = useState('');
	const [replace, setReplace] = useState(false);
	const run = useRun();
	const notify = useNotify();
	const rows = parseTsv(text);

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		if (replace && !window.confirm('既存の問題を全て削除して置き換えます。よろしいですか?')) {
			return;
		}
		const questions = convertTsvRowsToQuestions(rows, tsvExtraColumns);
		const done = await run(async () => {
			await send({type: 'questions.import', questions, replace});
			return true;
		});
		if (done) {
			notify(`${questions.length} 問を取り込みました`);
			setText('');
		}
	};

	const previewRows = rows.slice(0, 5);
	const maxCols = previewRows.reduce((max, r) => Math.max(max, r.length), 0);
	const extraCount = tsvExtraColumns?.length ?? 0;
	const unmappedCount = Math.max(0, maxCols - (3 + extraCount));

	const placeholder =
		tsvExtraColumns && tsvExtraColumns.length > 0
			? `問題文\t答え\tメモ\t${tsvExtraColumns.map((c) => c.label).join('\t')}`
			: '問題文\t答え\tメモ';

	return (
		<form className={styles.form} onSubmit={onSubmit}>
			<p className={pageStyles.muted}>
				スプレッドシートから「問題文」「答え」「メモ (省略可)」
				{tsvExtraColumns && tsvExtraColumns.length > 0
					? `「${tsvExtraColumns.map((c) => c.label).join('」「')}」`
					: ''}
				の列をコピーして貼り付けてください。
			</p>
			<textarea
				value={text}
				onChange={(event) => setText(event.target.value)}
				rows={6}
				placeholder={placeholder}
			/>
			{rows.length > 0 && (
				<div className={styles.previewContainer}>
					<div className={styles.previewHeader}>
						プレビュー (先頭 {previewRows.length} 行 / 全 {rows.length} 行)
					</div>
					<div className={styles.previewTableWrapper}>
						<table className={styles.previewTable}>
							<thead>
								<tr>
									<th>#</th>
									<th>問題文</th>
									<th>答え</th>
									<th>メモ</th>
									{tsvExtraColumns?.map((col) => (
										<th key={col.label}>{col.label}</th>
									))}
									{Array.from({length: unmappedCount}).map((_, i) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: プレビュー表示のためインデックスをキーに使用
										<th key={i} className={styles.unmappedHeader}>
											列 {4 + extraCount + i} (未割り当て)
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{previewRows.map((row, rIdx) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: プレビュー表示のためインデックスをキーに使用
									<tr key={rIdx}>
										<td className={styles.previewNumber}>{rIdx + 1}</td>
										<td>{row[0] ?? ''}</td>
										<td>{row[1] ?? ''}</td>
										<td>{row[2] ?? ''}</td>
										{tsvExtraColumns?.map((col, cIdx) => (
											<td key={col.label}>{row[3 + cIdx] ?? ''}</td>
										))}
										{Array.from({length: unmappedCount}).map((_, i) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: プレビュー表示のためインデックスをキーに使用
											<td key={i} className={styles.unmappedCell}>
												{row[3 + extraCount + i] ?? ''}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
			<div className={pageStyles.row}>
				<label>
					<input
						type="checkbox"
						checked={replace}
						onChange={(event) => setReplace(event.target.checked)}
					/>{' '}
					既存の問題を置き換える
				</label>
				<button type="submit" disabled={rows.length === 0}>
					{rows.length} 問を取り込む
				</button>
			</div>
		</form>
	);
};

const BackupJsonSection = ({
	game,
	send,
}: {
	game: ScreenProps<unknown>['view']['game'];
	send: ScreenProps<unknown>['send'];
}) => {
	const run = useRun();
	const notify = useNotify();
	const [replace, setReplace] = useState(false);
	const [questions, setQuestions] = useState<QuestionInput[] | null>(null);
	const [fileName, setFileName] = useState('');
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleExport = () => {
		const json = JSON.stringify(game.questions, null, 2);
		const blob = new Blob([json], {type: 'application/json'});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = getExportFileName(game.title);
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		notify(`${game.questions.length} 問の JSON をダウンロードしました`);
	};

	const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			setQuestions(null);
			setFileName('');
			return;
		}
		try {
			const text = await file.text();
			const parsed = parseQuestionsJson(text);
			setQuestions(parsed);
			setFileName(file.name);
		} catch (error) {
			notify(error instanceof Error ? error.message : String(error), 'error');
			setQuestions(null);
			setFileName('');
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		}
	};

	const handleImport = async (event: FormEvent) => {
		event.preventDefault();
		if (!questions || questions.length === 0) return;
		if (replace && !window.confirm('既存の問題を全て削除して置き換えます。よろしいですか?')) {
			return;
		}
		const done = await run(async () => {
			await send({type: 'questions.import', questions, replace});
			return true;
		});
		if (done) {
			notify(`${questions.length} 問を取り込みました`);
			setQuestions(null);
			setFileName('');
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		}
	};

	return (
		<div className={styles.backupSection}>
			<div className={styles.backupBlock}>
				<h3>エクスポート</h3>
				<p className={pageStyles.muted}>現在の問題を JSON ファイルとしてダウンロードします。</p>
				<div>
					<button type="button" onClick={handleExport} disabled={game.questions.length === 0}>
						JSON をエクスポート ({game.questions.length} 問)
					</button>
				</div>
			</div>
			<div className={styles.backupBlock}>
				<h3>インポート</h3>
				<p className={pageStyles.muted}>エクスポートした JSON ファイルから問題を取り込みます。</p>
				<form className={styles.form} onSubmit={handleImport}>
					<input
						ref={fileInputRef}
						type="file"
						accept=".json,application/json"
						onChange={handleFileChange}
					/>
					{questions && (
						<p className={pageStyles.muted}>
							「{fileName}」から {questions.length} 問読み込みました
						</p>
					)}
					<div className={pageStyles.row}>
						<label>
							<input
								type="checkbox"
								checked={replace}
								onChange={(event) => setReplace(event.target.checked)}
							/>{' '}
							既存の問題を置き換える
						</label>
						<button type="submit" disabled={!questions || questions.length === 0}>
							{questions ? `${questions.length} 問を取り込む` : '取り込む'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

const Editor = ({view, send}: ScreenProps<unknown>) => {
	const {game} = view;
	const run = useRun();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedGenre, setSelectedGenre] = useState('');

	const modeDef = modes[game.mode];
	const askedIds = useMemo(
		() => (modeDef.askedQuestionIds ? modeDef.askedQuestionIds(game) : new Set<string>()),
		[modeDef, game],
	);

	const tsvExtraColumns = screens[game.mode].tsvExtraColumns;
	const hasGenreSupport =
		Boolean(tsvExtraColumns?.some((col) => col.label === 'ジャンル')) ||
		game.questions.some((q) => typeof q.extra?.genre === 'string');

	const availableGenres = useMemo(() => {
		const set = new Set<string>();
		for (const q of game.questions) {
			if (typeof q.extra?.genre === 'string' && q.extra.genre.trim()) {
				set.add(q.extra.genre.trim());
			}
		}
		return Array.from(set).sort();
	}, [game.questions]);

	const filteredQuestions = useMemo(() => {
		const qLower = searchQuery.trim().toLowerCase();
		return game.questions
			.map((question, originalIndex) => ({question, originalIndex}))
			.filter(({question}) => {
				if (qLower) {
					const matchText = question.text.toLowerCase().includes(qLower);
					const matchAnswer = question.answer.toLowerCase().includes(qLower);
					if (!matchText && !matchAnswer) return false;
				}
				if (selectedGenre) {
					const genre =
						typeof question.extra?.genre === 'string' ? question.extra.genre.trim() : '';
					if (genre !== selectedGenre) return false;
				}
				return true;
			});
	}, [game.questions, searchQuery, selectedGenre]);

	const isFiltered = searchQuery.trim() !== '' || selectedGenre !== '';

	const add = (draft: Draft) =>
		run(async () => {
			await send({type: 'questions.add', question: draft});
			return true;
		}).then(Boolean);

	const update = (id: string, draft: Draft) =>
		run(async () => {
			await send({type: 'questions.update', id, ...draft});
			setEditingId(null);
			return true;
		}).then(Boolean);

	const move = (id: string, toIndex: number) =>
		run(() => send({type: 'questions.move', id, toIndex}));

	const startEdit = (question: Question) => {
		if (askedIds.has(question.id)) {
			if (
				!window.confirm(
					'この問題はすでに出題されています。編集すると過去の出題記録などにも影響します。編集しますか?',
				)
			) {
				return;
			}
		}
		setEditingId(question.id);
	};

	const remove = (question: Question) => {
		const isAsked = askedIds.has(question.id);
		const message = isAsked
			? 'この問題はすでに出題されています。出題記録は問題IDで参照しているため、削除すると司会者画面の履歴や感想戦で「(削除された問題)」になります。本当に削除しますか?'
			: `「${question.text.slice(0, 30)}」を削除しますか?`;
		if (window.confirm(message)) {
			void run(() => send({type: 'questions.delete', id: question.id}));
		}
	};

	return (
		<main className={pageStyles.page}>
			<header className={pageStyles.header}>
				<div>
					<h1>問題編集</h1>
					<div className={pageStyles.muted}>
						{game.title} ({modes[game.mode].name}) ・ {game.questions.length} 問
					</div>
				</div>
				<div className={pageStyles.links}>
					<Link to={`/games/${game.id}/host`}>司会者画面</Link>
					<Link to="/">トップへ</Link>
				</div>
			</header>

			<section className={pageStyles.card}>
				<h2>問題一覧</h2>
				{game.questions.length === 0 ? (
					<p className={pageStyles.muted}>問題がありません</p>
				) : (
					<>
						<div className={styles.filterBar}>
							<input
								type="search"
								placeholder="問題文・答えで絞り込み..."
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.target.value)}
								className={styles.searchInput}
							/>
							{hasGenreSupport && (
								<select
									value={selectedGenre}
									onChange={(event) => setSelectedGenre(event.target.value)}
									className={styles.genreSelect}
								>
									<option value="">すべてのジャンル</option>
									{availableGenres.map((genre) => (
										<option key={genre} value={genre}>
											{genre}
										</option>
									))}
								</select>
							)}
							{isFiltered && (
								<button
									type="button"
									onClick={() => {
										setSearchQuery('');
										setSelectedGenre('');
									}}
								>
									クリア
								</button>
							)}
							<span className={pageStyles.muted}>
								{isFiltered
									? `${filteredQuestions.length} / ${game.questions.length} 問を表示`
									: `${game.questions.length} 問`}
							</span>
						</div>
						{filteredQuestions.length === 0 ? (
							<p className={pageStyles.muted}>条件に一致する問題がありません</p>
						) : (
							<ol className={styles.list}>
								{filteredQuestions.map(({question, originalIndex}) => {
									const isAsked = askedIds.has(question.id);
									const warning = screens[game.mode].questionWarning?.(question);
									return (
										<li key={question.id} className={styles.item}>
											<span className={styles.number}>{originalIndex + 1}</span>
											{editingId === question.id ? (
												<QuestionForm
													mode={game.mode}
													initial={question}
													submitLabel="保存"
													onSubmit={(draft) => update(question.id, draft)}
													onCancel={() => setEditingId(null)}
												/>
											) : (
												<>
													<div className={styles.body}>
														<div className={styles.text}>
															{isAsked && <span className={styles.askedBadge}>出題済み</span>}
															{warning && (
																<span className={styles.warningBadge} title={warning}>
																	⚠️ {warning}
																</span>
															)}
															{question.text ||
																(game.mode === 'palindrome' ? (
																	<span className={pageStyles.muted}>(イラスト問題)</span>
																) : (
																	''
																))}
														</div>
														<div>
															<span className={styles.answerLabel}>答え</span> {question.answer}
														</div>
														{question.note && (
															<div className={pageStyles.muted}>{question.note}</div>
														)}
													</div>
													<div className={styles.actions}>
														<button
															type="button"
															onClick={() => move(question.id, 0)}
															disabled={isFiltered || originalIndex === 0}
															title={isFiltered ? '絞り込み中は並べ替えできません' : '先頭へ'}
															aria-label="先頭へ"
														>
															⤒
														</button>
														<button
															type="button"
															onClick={() => move(question.id, originalIndex - 1)}
															disabled={isFiltered || originalIndex === 0}
															title={isFiltered ? '絞り込み中は並べ替えできません' : '上へ'}
															aria-label="上へ"
														>
															↑
														</button>
														<button
															type="button"
															onClick={() => move(question.id, originalIndex + 1)}
															disabled={isFiltered || originalIndex === game.questions.length - 1}
															title={isFiltered ? '絞り込み中は並べ替えできません' : '下へ'}
															aria-label="下へ"
														>
															↓
														</button>
														<button
															type="button"
															onClick={() => move(question.id, game.questions.length - 1)}
															disabled={isFiltered || originalIndex === game.questions.length - 1}
															title={isFiltered ? '絞り込み中は並べ替えできません' : '末尾へ'}
															aria-label="末尾へ"
														>
															⤓
														</button>
														<button type="button" onClick={() => startEdit(question)}>
															編集
														</button>
														<button type="button" onClick={() => remove(question)}>
															削除
														</button>
													</div>
												</>
											)}
										</li>
									);
								})}
							</ol>
						)}
					</>
				)}
			</section>

			<section className={pageStyles.card}>
				<h2>問題を追加</h2>
				<QuestionForm mode={game.mode} initial={emptyDraft} submitLabel="追加" onSubmit={add} />
			</section>

			<section className={pageStyles.card}>
				<h2>まとめて取り込む (TSV)</h2>
				<ImportTsvForm send={send} tsvExtraColumns={tsvExtraColumns} />
			</section>

			<section className={pageStyles.card}>
				<h2>バックアップ (JSON)</h2>
				<BackupJsonSection game={game} send={send} />
			</section>
		</main>
	);
};

export const EditPage = () => {
	const {gameId = ''} = useParams();
	return (
		<HostGate>
			{(password) => (
				<GameScreen request={{gameId, role: 'host', password}}>
					{(props) => <Editor {...props} />}
				</GameScreen>
			)}
		</HostGate>
	);
};
