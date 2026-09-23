import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {uploadMedia} from './media.ts';
import {storage} from './storage.ts';

describe('uploadMedia', () => {
	const originalXHR = globalThis.XMLHttpRequest;

	let mockXhrInstance: MockXMLHttpRequest;

	class MockXMLHttpRequest {
		// biome-ignore lint/suspicious/noExplicitAny: Mock upload
		upload: {onprogress?: (e: any) => void} = {};
		open = vi.fn();
		setRequestHeader = vi.fn();
		send = vi.fn();
		abort = vi.fn();
		status = 200;
		responseText = JSON.stringify({
			id: 'default-id',
			mimeType: 'image/png',
			size: 1,
			originalName: 'default.png',
		});
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;

		constructor() {
			mockXhrInstance = this;
		}
	}

	beforeEach(() => {
		// biome-ignore lint/suspicious/noExplicitAny: Mock constructor
		globalThis.XMLHttpRequest = MockXMLHttpRequest as any;
	});

	afterEach(() => {
		globalThis.XMLHttpRequest = originalXHR;
		vi.restoreAllMocks();
	});

	it('正常にアップロードが完了し、MediaUploadResponse が返る', async () => {
		const file = new File(['dummy'], 'test.png', {type: 'image/png'});
		const promise = uploadMedia(file);

		mockXhrInstance.status = 201;
		mockXhrInstance.responseText = JSON.stringify({
			id: 'uploaded-123',
			mimeType: 'image/png',
			size: 5,
			originalName: 'test.png',
		});
		mockXhrInstance.onload?.();

		const res = await promise;
		expect(res.id).toBe('uploaded-123');
		expect(mockXhrInstance.open).toHaveBeenCalledWith('POST', '/api/media');
	});

	it('storage にパスワードがあれば X-Host-Password をセットする', async () => {
		vi.spyOn(storage, 'getHostPassword').mockReturnValue('my-secret-pass');
		const file = new File(['dummy'], 'test.png', {type: 'image/png'});
		const promise = uploadMedia(file);

		mockXhrInstance.status = 200;
		mockXhrInstance.onload?.();
		await promise;

		expect(mockXhrInstance.setRequestHeader).toHaveBeenCalledWith(
			'X-Host-Password',
			'my-secret-pass',
		);
	});

	it('onProgress コールバックが進捗率 (0〜100) で呼ばれる', async () => {
		const onProgress = vi.fn();
		const file = new File(['dummy'], 'test.png', {type: 'image/png'});
		const promise = uploadMedia(file, {onProgress});

		mockXhrInstance.upload.onprogress?.({
			lengthComputable: true,
			loaded: 50,
			total: 100,
		});
		expect(onProgress).toHaveBeenCalledWith(50);

		mockXhrInstance.upload.onprogress?.({
			lengthComputable: true,
			loaded: 100,
			total: 100,
		});
		expect(onProgress).toHaveBeenCalledWith(100);

		mockXhrInstance.status = 200;
		mockXhrInstance.onload?.();
		await promise;
	});

	it('サーバーエラー時にエラーメッセージで reject される', async () => {
		const file = new File(['dummy'], 'test.png', {type: 'image/png'});
		const promise = uploadMedia(file);

		mockXhrInstance.status = 401;
		mockXhrInstance.responseText = JSON.stringify({error: '司会者パスワードが違います'});
		mockXhrInstance.onload?.();

		await expect(promise).rejects.toThrow('司会者パスワードが違います');
	});

	it('通信エラー時に reject される', async () => {
		const file = new File(['dummy'], 'test.png', {type: 'image/png'});
		const promise = uploadMedia(file);

		mockXhrInstance.onerror?.();

		await expect(promise).rejects.toThrow('通信エラーが発生しました');
	});

	it('AbortSignal で中断できる', async () => {
		const controller = new AbortController();
		const file = new File(['dummy'], 'test.png', {type: 'image/png'});
		const promise = uploadMedia(file, {signal: controller.signal});

		controller.abort();

		expect(mockXhrInstance.abort).toHaveBeenCalled();
		await expect(promise).rejects.toThrow();
	});
});
