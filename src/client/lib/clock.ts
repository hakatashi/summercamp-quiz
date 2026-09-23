import {socket} from './socket.ts';

/**
 * サーバーとの時計のずれを推定する (NTP と同じ考え方)。
 * 往復時間 (RTT) が短いサンプルほど正確なので、直近のサンプルのうち RTT が最小のものを採用する。
 */

interface Sample {
	rtt: number;
	offset: number;
}

const MAX_SAMPLES = 12;
const samples: Sample[] = [];
let offset = 0;

/** 高精度なクライアントのエポック時刻 (ミリ秒) */
export const localNow = () => performance.timeOrigin + performance.now();

/** イベントが起きた時刻をエポック時刻に換算する (Event.timeStamp は timeOrigin からの経過時間) */
export const eventEpoch = (event: Event) => performance.timeOrigin + event.timeStamp;

/** クライアントのエポック時刻をサーバー時刻に換算する */
export const toServerTime = (localEpoch: number) => localEpoch + offset;

export const clockStatus = () => {
	const best = samples.reduce<Sample | null>((a, b) => (a && a.rtt <= b.rtt ? a : b), null);
	return {offset, rtt: best?.rtt ?? null};
};

const sample = async () => {
	const t0 = localNow();
	const server = await socket.timeout(3000).emitWithAck('time');
	const t1 = localNow();
	samples.push({rtt: t1 - t0, offset: server - (t0 + t1) / 2});
	if (samples.length > MAX_SAMPLES) samples.shift();
	const best = samples.reduce((a, b) => (a.rtt <= b.rtt ? a : b));
	offset = best.offset;
};

const syncBurst = async () => {
	for (let i = 0; i < 5; i++) {
		try {
			await sample();
		} catch {
			// 次の機会に再挑戦する
		}
	}
};

let started = false;

/** 時刻同期を始める。何度呼んでもよい */
export const startClockSync = () => {
	if (started) return;
	started = true;
	socket.on('connect', () => {
		// 接続経路が変わった可能性があるので、古いサンプルは捨てる
		samples.length = 0;
		void syncBurst();
	});
	if (socket.connected) void syncBurst();
	setInterval(() => {
		if (socket.connected) void sample().catch(() => {});
	}, 15_000);
};
