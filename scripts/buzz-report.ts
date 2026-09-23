#!/usr/bin/env node
import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {adjustPressedAt, BUZZ_GRACE_MS} from '../src/shared/buzz.ts';

interface EventRow {
	seq: number;
	command: string;
	actor: string;
	at: number;
	undone: number;
}

interface GameRow {
	id: string;
	mode: string;
	title: string;
	created_at: number;
	snapshot: string;
}

interface BuzzEntry {
	seq: number;
	participantId: string;
	participantName: string;
	declaredAt: number;
	receivedAt: number;
	adjustedAt: number;
	startedAt: number;
	rtt: number | null;
	offset: number | null;
	receivedRank: number;
	adjustedRank: number;
	reordered: boolean;
}

interface QuestionBlock {
	questionIndex: number;
	questionId: string | null;
	startedAt: number;
	buzzes: BuzzEntry[];
}

const formatMs = (ms: number | null): string => {
	if (ms === null || Number.isNaN(ms)) return '-';
	return `${ms >= 0 ? '+' : ''}${ms.toFixed(1)}ms`;
};

const formatElapsed = (ms: number): string => {
	return `${(ms / 1000).toFixed(3)}s (${ms.toFixed(1)}ms)`;
};

const percentile = (sorted: number[], p: number): number => {
	if (sorted.length === 0) return 0;
	const index = (sorted.length - 1) * p;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	const weight = index - lower;
	const lowerVal = sorted[lower] ?? 0;
	const upperVal = sorted[upper] ?? 0;
	return lowerVal * (1 - weight) + upperVal * weight;
};

const main = () => {
	const args = process.argv.slice(2);
	const gameIdArg = args[0];

	const defaultDbPath = process.env.DATA_DIR
		? join(process.env.DATA_DIR, 'quiz.sqlite')
		: 'data/quiz.sqlite';
	const dbPath = resolve(process.cwd(), defaultDbPath);

	if (!existsSync(dbPath)) {
		console.error(`エラー: データベースファイルが見つかりません (${dbPath})`);
		process.exit(1);
	}

	const db = new DatabaseSync(dbPath, {readOnly: true});

	if (!gameIdArg) {
		console.log('使用法: node scripts/buzz-report.ts <gameId>\n');
		console.log('直近のゲーム一覧:');
		const games = db
			.prepare(
				'SELECT id, title, mode, created_at FROM games WHERE deleted = 0 ORDER BY created_at DESC LIMIT 10',
			)
			.all() as unknown as Array<{id: string; title: string; mode: string; created_at: number}>;

		if (games.length === 0) {
			console.log('  (登録されているゲームがありません)');
		} else {
			for (const g of games) {
				const date = new Date(g.created_at).toLocaleString('ja-JP');
				console.log(`  ID: ${g.id.padEnd(10)} [${g.mode}] "${g.title}" (${date})`);
			}
		}
		process.exit(0);
	}

	const gameRow = db.prepare('SELECT * FROM games WHERE id = ?').get(gameIdArg) as unknown as
		| GameRow
		| undefined;

	if (!gameRow) {
		console.error(`エラー: ゲームID "${gameIdArg}" が見つかりません`);
		process.exit(1);
	}

	let gameSnapshot: {participants?: Array<{id: string; name: string}>} = {};
	try {
		gameSnapshot = JSON.parse(gameRow.snapshot);
	} catch {
		// パース失敗時は無視
	}

	const participantNames = new Map<string, string>();
	for (const p of gameSnapshot.participants ?? []) {
		participantNames.set(p.id, p.name);
	}

	const rawEvents = db
		.prepare('SELECT seq, command, actor, at, undone FROM events WHERE game_id = ? ORDER BY seq')
		.all(gameIdArg) as unknown as EventRow[];

	const questions: QuestionBlock[] = [];
	let currentQuestion: QuestionBlock | null = null;
	let questionCounter = 0;

	for (const row of rawEvents) {
		if (row.undone === 1) continue;

		let command: Record<string, unknown>;
		let actor: {role?: string; participantId?: string};
		try {
			command = JSON.parse(row.command);
			actor = JSON.parse(row.actor);
		} catch {
			continue;
		}

		if (command.type === 'participants.join') {
			if (typeof command.participantId === 'string' && typeof command.name === 'string') {
				participantNames.set(command.participantId, command.name);
			}
		}

		if (command.type === 'next') {
			questionCounter++;
			currentQuestion = {
				questionIndex: questionCounter,
				questionId: typeof command.questionId === 'string' ? command.questionId : null,
				startedAt: row.at,
				buzzes: [],
			};
			questions.push(currentQuestion);
			continue;
		}

		if (command.type === 'buzz' && currentQuestion) {
			const participantId =
				actor.role === 'participant' && typeof actor.participantId === 'string'
					? actor.participantId
					: 'unknown';
			const participantName = participantNames.get(participantId) ?? participantId;

			const declaredAt = typeof command.pressedAt === 'number' ? command.pressedAt : row.at;
			const receivedAt = row.at;
			const adjustedAt = adjustPressedAt(
				declaredAt,
				currentQuestion.startedAt,
				receivedAt,
				BUZZ_GRACE_MS,
			);

			const diag =
				typeof command.diag === 'object' && command.diag !== null
					? (command.diag as {rtt?: number; offset?: number})
					: undefined;

			currentQuestion.buzzes.push({
				seq: row.seq,
				participantId,
				participantName,
				declaredAt,
				receivedAt,
				adjustedAt,
				startedAt: currentQuestion.startedAt,
				rtt: typeof diag?.rtt === 'number' ? diag.rtt : null,
				offset: typeof diag?.offset === 'number' ? diag.offset : null,
				receivedRank: 0,
				adjustedRank: 0,
				reordered: false,
			});
		}
	}

	// 順位付けと並べ替えの判定
	let totalBuzzes = 0;
	let totalReordered = 0;
	const allRtts: number[] = [];
	const allOffsets: number[] = [];
	const participantStats = new Map<
		string,
		{name: string; buzzCount: number; rtts: number[]; offsets: number[]; wins: number}
	>();

	for (const q of questions) {
		const byReceived = [...q.buzzes].sort((a, b) => a.receivedAt - b.receivedAt);
		byReceived.forEach((b, idx) => {
			b.receivedRank = idx + 1;
		});

		const byAdjusted = [...q.buzzes].sort(
			(a, b) => a.adjustedAt - b.adjustedAt || a.receivedAt - b.receivedAt,
		);
		byAdjusted.forEach((b, idx) => {
			b.adjustedRank = idx + 1;
			b.reordered = b.receivedRank !== b.adjustedRank;
			if (b.reordered) totalReordered++;
			totalBuzzes++;

			if (b.rtt !== null) allRtts.push(b.rtt);
			if (b.offset !== null) allOffsets.push(b.offset);

			const stat = participantStats.get(b.participantId) ?? {
				name: b.participantName,
				buzzCount: 0,
				rtts: [],
				offsets: [],
				wins: 0,
			};
			stat.buzzCount++;
			if (idx === 0) stat.wins++;
			if (b.rtt !== null) stat.rtts.push(b.rtt);
			if (b.offset !== null) stat.offsets.push(b.offset);
			participantStats.set(b.participantId, stat);
		});

		q.buzzes = byAdjusted;
	}

	// 出力
	console.log('='.repeat(70));
	console.log(`早押し分析レポート: ${gameRow.title} (ID: ${gameRow.id})`);
	console.log(`モード: ${gameRow.mode}, 許容遅延: ${BUZZ_GRACE_MS}ms`);
	console.log(`出題数: ${questions.length}, 総押下数: ${totalBuzzes}`);
	console.log('='.repeat(70));
	console.log();

	for (const q of questions) {
		console.log(
			`--- 第 ${q.questionIndex} 問 ${q.questionId ? `(ID: ${q.questionId})` : ''} [開始: ${new Date(q.startedAt).toLocaleTimeString('ja-JP')}] ---`,
		);

		if (q.buzzes.length === 0) {
			console.log('  (押下なし)\n');
			continue;
		}

		const tableData = q.buzzes.map((b) => ({
			順位: b.adjustedRank,
			受信順: b.receivedRank,
			並替: b.reordered ? 'YES' : '-',
			参加者: b.participantName,
			'補正後 (出題から)': formatElapsed(b.adjustedAt - b.startedAt),
			'申告 (出題から)': formatElapsed(b.declaredAt - b.startedAt),
			補正差: formatMs(b.adjustedAt - b.declaredAt),
			RTT: b.rtt !== null ? `${b.rtt.toFixed(1)}ms` : '-',
			Offset: formatMs(b.offset),
		}));

		console.table(tableData);
		console.log();
	}

	// サマリー集計
	console.log('='.repeat(70));
	console.log('サマリー統計:');
	console.log('='.repeat(70));

	const reorderRate = totalBuzzes > 0 ? ((totalReordered / totalBuzzes) * 100).toFixed(1) : '0.0';
	console.log(
		`並べ替え発生回数: ${totalReordered} / ${totalBuzzes} 回 (${reorderRate}% の押下で順序逆転が補正された)`,
	);

	if (allRtts.length > 0) {
		allRtts.sort((a, b) => a - b);
		const minRtt = allRtts[0] ?? 0;
		const maxRtt = allRtts[allRtts.length - 1] ?? 0;
		const medianRtt = percentile(allRtts, 0.5);
		const p95Rtt = percentile(allRtts, 0.95);
		const avgRtt = allRtts.reduce((a, b) => a + b, 0) / allRtts.length;
		console.log(
			`RTT 分布 (全 ${allRtts.length} サンプル): 最小 ${minRtt.toFixed(1)}ms / 中央値 ${medianRtt.toFixed(1)}ms / 平均 ${avgRtt.toFixed(1)}ms / 95%tile ${p95Rtt.toFixed(1)}ms / 最大 ${maxRtt.toFixed(1)}ms`,
		);
	} else {
		console.log('RTT 診断情報: なし (古いバージョンのクライアントまたは診断情報未送信)');
	}

	if (allOffsets.length > 0) {
		allOffsets.sort((a, b) => a - b);
		const minOff = allOffsets[0] ?? 0;
		const maxOff = allOffsets[allOffsets.length - 1] ?? 0;
		const medianOff = percentile(allOffsets, 0.5);
		console.log(
			`時計 Offset 分布: 最小 ${formatMs(minOff)} / 中央値 ${formatMs(medianOff)} / 最大 ${formatMs(maxOff)}`,
		);
	}
	console.log();

	if (participantStats.size > 0) {
		console.log('参加者別統計:');
		const pTable = [...participantStats.values()].map((s) => {
			const avgR =
				s.rtts.length > 0
					? `${(s.rtts.reduce((a, b) => a + b, 0) / s.rtts.length).toFixed(1)}ms`
					: '-';
			const avgOff =
				s.offsets.length > 0
					? formatMs(s.offsets.reduce((a, b) => a + b, 0) / s.offsets.length)
					: '-';
			return {
				参加者: s.name,
				押下回数: s.buzzCount,
				最速回答権獲得: s.wins,
				平均RTT: avgR,
				平均Offset: avgOff,
			};
		});
		console.table(pTable);
		console.log();
	}
};

main();
