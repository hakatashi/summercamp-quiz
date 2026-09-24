export type MathSegment =
	| {type: 'text'; value: string}
	| {type: 'math'; value: string; display: boolean};

const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char);
const isDigit = (char: string | undefined) => char !== undefined && /[0-9]/.test(char);

/**
 * 閉じの `$` を探す。見つからなければ -1。
 * インライン数式は Pandoc と同じく、開きの直後と閉じの直前が空白でなく、閉じの直後が数字でないものに限る
 * (「$20 と $30」のような金額を数式と誤認しないため)。空行はまたがない。
 */
const findClose = (input: string, from: number, display: boolean): number => {
	if (!display && (isSpace(input[from]) || input[from] === '$')) {
		return -1;
	}
	for (let i = from; i < input.length; i++) {
		const char = input[i];
		if (char === '\\') {
			// \$ などのエスケープは数式の中身としてそのまま残す
			i++;
			continue;
		}
		if (char === '\n' && input[i + 1] === '\n') {
			return -1;
		}
		if (char !== '$') {
			continue;
		}
		if (display) {
			if (input[i + 1] === '$') return i;
			continue;
		}
		if (!isSpace(input[i - 1]) && !isDigit(input[i + 1])) {
			return i;
		}
	}
	return -1;
};

/**
 * Markdown と同じ書き方 (`$...$` はインライン、`$$...$$` はディスプレイ) の数式を含む文字列を分割する。
 * `\$` は数式の外ではただの `$` として扱う。
 */
export const splitMath = (input: string): MathSegment[] => {
	const segments: MathSegment[] = [];
	let text = '';
	const flushText = () => {
		if (text !== '') segments.push({type: 'text', value: text});
		text = '';
	};

	let i = 0;
	while (i < input.length) {
		const char = input[i] as string;
		if (char === '\\' && input[i + 1] === '$') {
			text += '$';
			i += 2;
			continue;
		}
		if (char === '$') {
			const display = input[i + 1] === '$';
			const open = display ? 2 : 1;
			const close = findClose(input, i + open, display);
			if (close !== -1 && close > i + open) {
				if (display) {
					// ブロックとして表示するので、前後の改行は取り除く
					text = text.replace(/\n$/, '');
				}
				flushText();
				segments.push({type: 'math', value: input.slice(i + open, close).trim(), display});
				i = close + open;
				if (display && input[i] === '\n') i++;
				continue;
			}
			text += display ? '$$' : '$';
			i += open;
			continue;
		}
		text += char;
		i++;
	}
	flushText();
	return segments;
};
