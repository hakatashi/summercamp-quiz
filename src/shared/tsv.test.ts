import {describe, expect, it} from 'vitest';
import {parseTsv} from './tsv.ts';

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
