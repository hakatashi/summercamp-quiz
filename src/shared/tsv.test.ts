import {describe, expect, it} from 'vitest';
import {convertTsvRowsToQuestions, parseTsv, type TsvExtraColumn} from './tsv.ts';

describe('parseTsv', () => {
	it('タブと改行で区切る', () => {
		expect(parseTsv('a\tb\tc\nd\te\n')).toEqual([
			['a', 'b', 'c'],
			['d', 'e'],
		]);
	});

	it('CRLF と空行を扱う', () => {
		expect(parseTsv('a\tb\r\n\r\nc\td')).toEqual([
			['a', 'b'],
			['c', 'd'],
		]);
	});

	it('クォートされたセルの中の改行、タブ、エスケープされたクォート', () => {
		expect(parseTsv('"1行目\n2行目"\t"x\ty"\t"say ""hi"""\nz')).toEqual([
			['1行目\n2行目', 'x\ty', 'say "hi"'],
			['z'],
		]);
	});

	it('セルの途中のクォートはそのまま', () => {
		expect(parseTsv('5"\t答え')).toEqual([['5"', '答え']]);
	});
});

describe('convertTsvRowsToQuestions', () => {
	it('追加列の定義がないときは、問題文・答え・メモを取り込み extra は空にする', () => {
		const rows = [
			[' 問題1 ', ' 答え1 ', ' メモ1 '],
			['問題2', '答え2'],
		];
		const questions = convertTsvRowsToQuestions(rows);
		expect(questions).toEqual([
			{text: '問題1', answer: '答え1', note: 'メモ1', extra: {}},
			{text: '問題2', answer: '答え2', note: '', extra: {}},
		]);
	});

	it('4列目以降を extraColumns の定義に沿って extra に変換する', () => {
		const rows = [
			['問題1', '答え1', 'メモ1', '地理', '難問'],
			['問題2', '答え2', 'メモ2', '歴史'],
		];
		const extraColumns: TsvExtraColumn[] = [
			{label: 'ジャンル', toExtra: (cell) => ({genre: cell.trim()})},
			{label: '難易度', toExtra: (cell) => ({difficulty: cell.trim() || '普通'})},
		];
		const questions = convertTsvRowsToQuestions(rows, extraColumns);
		expect(questions).toEqual([
			{
				text: '問題1',
				answer: '答え1',
				note: 'メモ1',
				extra: {genre: '地理', difficulty: '難問'},
			},
			{
				text: '問題2',
				answer: '答え2',
				note: 'メモ2',
				extra: {genre: '歴史', difficulty: '普通'},
			},
		]);
	});
});
