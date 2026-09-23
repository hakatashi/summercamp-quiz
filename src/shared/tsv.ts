/**
 * TSV を解析する。スプレッドシートからコピーしたときの形式に合わせ、
 * ダブルクォートで囲まれたセル (改行やタブを含められる、"" はエスケープ) に対応する。
 */
export const parseTsv = (input: string): string[][] => {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let i = 0;
	let quoted = false;
	const text = input.replace(/\r\n?/g, '\n');

	const endCell = () => {
		row.push(cell);
		cell = '';
	};
	const endRow = () => {
		endCell();
		rows.push(row);
		row = [];
	};

	while (i < text.length) {
		const char = text[i] as string;
		if (quoted) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i += 2;
					continue;
				}
				quoted = false;
			} else {
				cell += char;
			}
			i++;
			continue;
		}
		if (char === '"' && cell === '') {
			quoted = true;
		} else if (char === '\t') {
			endCell();
		} else if (char === '\n') {
			endRow();
		} else {
			cell += char;
		}
		i++;
	}
	if (cell !== '' || row.length > 0) {
		endRow();
	}
	// 空行は捨てる
	return rows.filter((r) => r.some((c) => c.trim() !== ''));
};

import type {QuestionInput} from './commands.ts';
import type {Question} from './types.ts';

export interface TsvExtraColumn {
	label: string;
	toExtra: (cell: string) => Partial<Question['extra']>;
}

/**
 * TSV の行データを QuestionInput の配列に変換する。
 * 1列目を問題文、2列目を答え、3列目をメモとし、
 * 4列目以降は extraColumns の定義に従って Question.extra に割り当てる。
 */
export const convertTsvRowsToQuestions = (
	rows: string[][],
	extraColumns: readonly TsvExtraColumn[] = [],
): QuestionInput[] => {
	return rows.map((row) => {
		const [text = '', answer = '', note = '', ...extraCells] = row;
		let extra: Record<string, unknown> = {};
		for (let i = 0; i < extraColumns.length; i++) {
			const col = extraColumns[i];
			const cell = extraCells[i] ?? '';
			if (col) {
				extra = {...extra, ...col.toExtra(cell)};
			}
		}
		return {
			text: text.trim(),
			answer: answer.trim(),
			note: note.trim(),
			extra,
		};
	});
};
