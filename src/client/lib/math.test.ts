import {describe, expect, it} from 'vitest';
import {splitMath} from './math.ts';

describe('splitMath', () => {
	it('数式を含まない文字列はそのまま', () => {
		expect(splitMath('ふつうの文章\n2行目')).toEqual([
			{type: 'text', value: 'ふつうの文章\n2行目'},
		]);
		expect(splitMath('')).toEqual([]);
	});

	it('インライン数式を分ける', () => {
		expect(splitMath('解は $x = \\frac{1}{2}$ です')).toEqual([
			{type: 'text', value: '解は '},
			{type: 'math', value: 'x = \\frac{1}{2}', display: false},
			{type: 'text', value: ' です'},
		]);
	});

	it('ディスプレイ数式を分け、前後の改行を取り除く', () => {
		expect(splitMath('次の式より\n$$\na^2 + b^2 = c^2\n$$\nとなる')).toEqual([
			{type: 'text', value: '次の式より'},
			{type: 'math', value: 'a^2 + b^2 = c^2', display: true},
			{type: 'text', value: 'となる'},
		]);
	});

	it('金額のような $ は数式にしない', () => {
		expect(splitMath('$20 と $30')).toEqual([{type: 'text', value: '$20 と $30'}]);
		expect(splitMath('$ x $')).toEqual([{type: 'text', value: '$ x $'}]);
	});

	it('閉じていない $ はそのまま文字として扱う', () => {
		expect(splitMath('a $b')).toEqual([{type: 'text', value: 'a $b'}]);
		expect(splitMath('$$x')).toEqual([{type: 'text', value: '$$x'}]);
	});

	it('\\$ はエスケープとして扱う', () => {
		expect(splitMath('\\$5 と $\\$x$')).toEqual([
			{type: 'text', value: '$5 と '},
			{type: 'math', value: '\\$x', display: false},
		]);
	});

	it('インライン数式は空行をまたがない', () => {
		expect(splitMath('$a\n\nb$')).toEqual([{type: 'text', value: '$a\n\nb$'}]);
	});
});
