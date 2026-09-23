import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {MAX_AUDIO_SIZE, MAX_IMAGE_SIZE, type MediaUploadResponse} from '../shared/media.ts';
import {createApp} from './app.ts';

const PASSWORD = 'secret';

interface ErrorResponse {
	error: string;
}

describe('Media API (アップロード・取得・認証・Range)', () => {
	let app: ReturnType<typeof createApp>;
	let url: string;
	let mediaDir: string;

	beforeEach(async () => {
		mediaDir = mkdtempSync(join(tmpdir(), 'quiz-media-test-'));
		app = createApp({
			dbPath: ':memory:',
			mediaDir,
			hostPassword: PASSWORD,
		});
		const port = await app.listen(0, '127.0.0.1');
		url = `http://127.0.0.1:${port}`;
	});

	afterEach(async () => {
		await app.close();
		rmSync(mediaDir, {recursive: true, force: true});
	});

	it('パスワードが違う、または未指定だとアップロードが拒否される', async () => {
		const form = new FormData();
		const file = new File(['test image data'], 'sample.png', {type: 'image/png'});
		form.append('file', file);

		// パスワードなし
		const resNoAuth = await fetch(`${url}/api/media`, {
			method: 'POST',
			body: form,
		});
		expect(resNoAuth.status).toBe(401);
		const jsonNoAuth = (await resNoAuth.json()) as ErrorResponse;
		expect(jsonNoAuth.error).toBe('司会者パスワードが違います');

		// 誤ったパスワード
		const resWrongAuth = await fetch(`${url}/api/media`, {
			method: 'POST',
			headers: {'X-Host-Password': 'wrong'},
			body: form,
		});
		expect(resWrongAuth.status).toBe(401);
	});

	it('HOST_PASSWORD が未設定 (空文字) の場合はパスワードなしでアップロードできる', async () => {
		const noAuthApp = createApp({
			dbPath: ':memory:',
			mediaDir,
			hostPassword: '',
		});
		const port = await noAuthApp.listen(0, '127.0.0.1');
		try {
			const form = new FormData();
			const file = new File(['image data'], 'pic.png', {type: 'image/png'});
			form.append('file', file);

			const res = await fetch(`http://127.0.0.1:${port}/api/media`, {
				method: 'POST',
				body: form,
			});
			expect(res.status).toBe(201);
		} finally {
			await noAuthApp.close();
		}
	});

	it('未許可の MIME タイプはアップロードが拒否される', async () => {
		const form = new FormData();
		const file = new File(['dummy pdf'], 'doc.pdf', {type: 'application/pdf'});
		form.append('file', file);

		const res = await fetch(`${url}/api/media`, {
			method: 'POST',
			headers: {'X-Host-Password': PASSWORD},
			body: form,
		});
		expect(res.status).toBe(400);
		const json = (await res.json()) as ErrorResponse;
		expect(json.error).toBe('許可されていないファイル形式です');
	});

	it('ファイル未指定の場合は 400 エラーになる', async () => {
		const form = new FormData();
		form.append('dummy', 'value');

		const res = await fetch(`${url}/api/media`, {
			method: 'POST',
			headers: {'X-Host-Password': PASSWORD},
			body: form,
		});
		expect(res.status).toBe(400);
		const json = (await res.json()) as ErrorResponse;
		expect(json.error).toBe('ファイルが指定されていません');
	});

	it('画像サイズ上限 (20MB) を超えると拒否される', async () => {
		const form = new FormData();
		// 20MB + 1byte のダミー Blob
		const largeBlob = new Blob([new Uint8Array(MAX_IMAGE_SIZE + 1)], {type: 'image/png'});
		form.append('file', largeBlob, 'large.png');

		const res = await fetch(`${url}/api/media`, {
			method: 'POST',
			headers: {'X-Host-Password': PASSWORD},
			body: form,
		});
		expect(res.status).toBe(413);
		const json = (await res.json()) as ErrorResponse;
		expect(json.error).toContain('20MB');
	});

	it('音声サイズ上限 (100MB) を超えると拒否される', async () => {
		const form = new FormData();
		// 100MB + 1byte のダミー Blob
		const largeBlob = new Blob([new Uint8Array(MAX_AUDIO_SIZE + 1)], {type: 'audio/mpeg'});
		form.append('file', largeBlob, 'large.mp3');

		const res = await fetch(`${url}/api/media`, {
			method: 'POST',
			headers: {'X-Host-Password': PASSWORD},
			body: form,
		});
		expect(res.status).toBe(413);
		const json = (await res.json()) as ErrorResponse;
		expect(json.error).toContain('100MB');
	});

	it('画像をアップロードして取得できる (Cache-Control, Content-Type 等の検証)', async () => {
		const content = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		const form = new FormData();
		const file = new File([content], 'image.png', {type: 'image/png'});
		form.append('file', file);

		const postRes = await fetch(`${url}/api/media`, {
			method: 'POST',
			headers: {'X-Host-Password': PASSWORD},
			body: form,
		});
		expect(postRes.status).toBe(201);
		const postJson = (await postRes.json()) as MediaUploadResponse;
		expect(postJson).toMatchObject({
			mimeType: 'image/png',
			size: 8,
			originalName: 'image.png',
		});
		expect(typeof postJson.id).toBe('string');
		expect(postJson.id.length).toBeGreaterThan(0);

		// GET /api/media/:id
		const getRes = await fetch(`${url}/api/media/${postJson.id}`);
		expect(getRes.status).toBe(200);
		expect(getRes.headers.get('Content-Type')).toBe('image/png');
		expect(getRes.headers.get('Content-Length')).toBe('8');
		expect(getRes.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		expect(getRes.headers.get('Accept-Ranges')).toBe('bytes');

		const body = new Uint8Array(await getRes.arrayBuffer());
		expect(Array.from(body)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	});

	it('音声のアップロードと Range リクエストによるシークが機能する', async () => {
		// 100 バイトのダミー音声データ [0, 1, 2, ..., 99]
		const audioData = new Uint8Array(100);
		for (let i = 0; i < 100; i++) audioData[i] = i;

		const form = new FormData();
		const file = new File([audioData], 'audio.mp3', {type: 'audio/mpeg'});
		form.append('file', file);

		const postRes = await fetch(`${url}/api/media`, {
			method: 'POST',
			headers: {'X-Host-Password': PASSWORD},
			body: form,
		});
		expect(postRes.status).toBe(201);
		const {id} = (await postRes.json()) as MediaUploadResponse;

		// 1. 通常取得 (Range なし)
		const resFull = await fetch(`${url}/api/media/${id}`);
		expect(resFull.status).toBe(200);
		expect(resFull.headers.get('Content-Length')).toBe('100');
		expect(resFull.headers.get('Content-Type')).toBe('audio/mpeg');

		// 2. bytes=0-9 (先頭 10 バイト)
		const resRange1 = await fetch(`${url}/api/media/${id}`, {
			headers: {Range: 'bytes=0-9'},
		});
		expect(resRange1.status).toBe(206);
		expect(resRange1.headers.get('Content-Range')).toBe('bytes 0-9/100');
		expect(resRange1.headers.get('Content-Length')).toBe('10');
		const body1 = new Uint8Array(await resRange1.arrayBuffer());
		expect(body1).toEqual(audioData.slice(0, 10));

		// 3. bytes=20-49 (途中の 30 バイト)
		const resRange2 = await fetch(`${url}/api/media/${id}`, {
			headers: {Range: 'bytes=20-49'},
		});
		expect(resRange2.status).toBe(206);
		expect(resRange2.headers.get('Content-Range')).toBe('bytes 20-49/100');
		expect(resRange2.headers.get('Content-Length')).toBe('30');
		const body2 = new Uint8Array(await resRange2.arrayBuffer());
		expect(body2).toEqual(audioData.slice(20, 50));

		// 4. bytes=90- (末尾 10 バイト)
		const resRange3 = await fetch(`${url}/api/media/${id}`, {
			headers: {Range: 'bytes=90-'},
		});
		expect(resRange3.status).toBe(206);
		expect(resRange3.headers.get('Content-Range')).toBe('bytes 90-99/100');
		expect(resRange3.headers.get('Content-Length')).toBe('10');
		const body3 = new Uint8Array(await resRange3.arrayBuffer());
		expect(body3).toEqual(audioData.slice(90, 100));

		// 5. bytes=-15 (末尾からの 15 バイト)
		const resRange4 = await fetch(`${url}/api/media/${id}`, {
			headers: {Range: 'bytes=-15'},
		});
		expect(resRange4.status).toBe(206);
		expect(resRange4.headers.get('Content-Range')).toBe('bytes 85-99/100');
		expect(resRange4.headers.get('Content-Length')).toBe('15');
		const body4 = new Uint8Array(await resRange4.arrayBuffer());
		expect(body4).toEqual(audioData.slice(85, 100));

		// 6. 不正な Range (範囲外: bytes=200-300)
		const resInvalidRange1 = await fetch(`${url}/api/media/${id}`, {
			headers: {Range: 'bytes=200-300'},
		});
		expect(resInvalidRange1.status).toBe(416);
		expect(resInvalidRange1.headers.get('Content-Range')).toBe('bytes */100');

		// 7. 不正な Range (start > end: bytes=50-40)
		const resInvalidRange2 = await fetch(`${url}/api/media/${id}`, {
			headers: {Range: 'bytes=50-40'},
		});
		expect(resInvalidRange2.status).toBe(416);
	});

	it('存在しないメディア ID は 404 を返す', async () => {
		const res = await fetch(`${url}/api/media/non-existent-id`);
		expect(res.status).toBe(404);
	});
});
