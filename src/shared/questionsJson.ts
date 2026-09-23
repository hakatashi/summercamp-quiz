import {z} from 'zod';
import {type QuestionInput, questionInputSchema} from './commands.ts';

const questionsImportSchema = z.array(questionInputSchema);

/**
 * バックアップ用 JSON 文字列を検証・パースし、サーバーに送信可能な QuestionInput の配列を返す。
 * 取り込み時に既存の ID と衝突しないよう、各問題の id は破棄してサーバーに振り直させる。
 */
export const parseQuestionsJson = (jsonString: string): QuestionInput[] => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonString);
	} catch (error) {
		throw new Error(
			`JSON の形式が不正です: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const result = questionsImportSchema.safeParse(parsed);
	if (!result.success) {
		const details = result.error.issues
			.map((issue) =>
				issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
			)
			.join(', ');
		throw new Error(`問題データの形式が不正です: ${details}`);
	}
	return result.data.map(({id: _id, ...rest}) => rest);
};

export const formatExportDate = (date: Date): string => {
	const pad = (n: number) => String(n).padStart(2, '0');
	const y = date.getFullYear();
	const m = pad(date.getMonth() + 1);
	const d = pad(date.getDate());
	const h = pad(date.getHours());
	const min = pad(date.getMinutes());
	return `${y}${m}${d}-${h}${min}`;
};

export const getExportFileName = (gameTitle: string, date: Date = new Date()): string => {
	const safeTitle = gameTitle.replace(/[/\\?%*:|"<>]/g, '_') || 'quiz';
	return `${safeTitle}-questions-${formatExportDate(date)}.json`;
};
