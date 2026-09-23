import {type FormEvent, useState} from 'react';
import {Link, useParams} from 'react-router';
import {modes} from '../../shared/modes/registry.ts';
import {parseTsv} from '../../shared/tsv.ts';
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
				問題文
				<textarea
					value={draft.text}
					onChange={(event) => setDraft({...draft, text: event.target.value})}
					rows={3}
					required
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
				<ExtraFields value={draft.extra} onChange={(extra) => setDraft({...draft, extra})} />
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

const ImportForm = ({send}: {send: ScreenProps<unknown>['send']}) => {
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
		const questions = rows.map(([questionText = '', answer = '', note = '']) => ({
			text: questionText.trim(),
			answer: answer.trim(),
			note: note.trim(),
		}));
		const done = await run(async () => {
			await send({type: 'questions.import', questions, replace});
			return true;
		});
		if (done) {
			notify(`${questions.length} 問を取り込みました`);
			setText('');
		}
	};

	return (
		<form className={styles.form} onSubmit={onSubmit}>
			<p className={pageStyles.muted}>
				スプレッドシートから「問題文」「答え」「メモ (省略可)」の列をコピーして貼り付けてください。
			</p>
			<textarea
				value={text}
				onChange={(event) => setText(event.target.value)}
				rows={6}
				placeholder={'問題文\t答え\tメモ'}
			/>
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

const Editor = ({view, send}: ScreenProps<unknown>) => {
	const {game} = view;
	const run = useRun();
	const [editingId, setEditingId] = useState<string | null>(null);

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

	const remove = (question: Question) => {
		if (window.confirm(`「${question.text.slice(0, 30)}」を削除しますか?`)) {
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
				{game.questions.length === 0 && <p className={pageStyles.muted}>問題がありません</p>}
				<ol className={styles.list}>
					{game.questions.map((question, index) => (
						<li key={question.id} className={styles.item}>
							<span className={styles.number}>{index + 1}</span>
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
										<div className={styles.text}>{question.text}</div>
										<div>
											<span className={styles.answerLabel}>答え</span> {question.answer}
										</div>
										{question.note && <div className={pageStyles.muted}>{question.note}</div>}
									</div>
									<div className={styles.actions}>
										<button
											type="button"
											onClick={() => move(question.id, index - 1)}
											disabled={index === 0}
											aria-label="上へ"
										>
											↑
										</button>
										<button
											type="button"
											onClick={() => move(question.id, index + 1)}
											disabled={index === game.questions.length - 1}
											aria-label="下へ"
										>
											↓
										</button>
										<button type="button" onClick={() => setEditingId(question.id)}>
											編集
										</button>
										<button type="button" onClick={() => remove(question)}>
											削除
										</button>
									</div>
								</>
							)}
						</li>
					))}
				</ol>
			</section>

			<section className={pageStyles.card}>
				<h2>問題を追加</h2>
				<QuestionForm mode={game.mode} initial={emptyDraft} submitLabel="追加" onSubmit={add} />
			</section>

			<section className={pageStyles.card}>
				<h2>まとめて取り込む (TSV)</h2>
				<ImportForm send={send} />
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
