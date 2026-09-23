/**
 * notation (例: 枕から熊) から文字種ヒント文字列 (例: 漢ああ漢) を生成する。
 * ひらがな → あ、カタカナ → ア、漢字 → 漢、英字 → A に置き換える。
 * 長音「ー」は直前の文字と同じ文字種にする。
 */
export const generateCharTypes = (notation: string): string => {
	const chars = [...notation];
	const result: string[] = [];
	let lastCharType = 'ア';
	for (const char of chars) {
		if (char === 'ー') {
			result.push(lastCharType);
		} else if (/^[\u3041-\u3096]$/.test(char)) {
			lastCharType = 'あ';
			result.push('あ');
		} else if (/^[\u30A1-\u30FA]$/.test(char)) {
			lastCharType = 'ア';
			result.push('ア');
		} else if (/^\p{Script=Han}$/u.test(char)) {
			lastCharType = '漢';
			result.push('漢');
		} else if (/^[A-Za-z]$/.test(char)) {
			lastCharType = 'A';
			result.push('A');
		} else {
			result.push(char);
		}
	}
	return result.join('');
};

/**
 * charTypes が手動指定されていればそちらを優先し、なければ notation から自動生成する。
 */
export const getCharTypesHint = (notation: string, charTypes?: string): string => {
	if (charTypes && charTypes.trim() !== '') {
		return charTypes;
	}
	return generateCharTypes(notation);
};
