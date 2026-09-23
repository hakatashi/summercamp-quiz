import type {MediaUploadResponse} from '../../shared/media.ts';
import {storage} from './storage.ts';

export interface UploadMediaOptions {
	/** 進捗コールバック (0〜100) */
	onProgress?: (progress: number) => void;
	/** 中止用 AbortSignal */
	signal?: AbortSignal;
}

/**
 * ファイルを /api/media にアップロードする。
 * X-Host-Password は storage から自動付与される。
 */
export const uploadMedia = (
	file: File,
	options?: UploadMediaOptions,
): Promise<MediaUploadResponse> => {
	return new Promise((resolve, reject) => {
		if (options?.signal?.aborted) {
			reject(new DOMException('Upload aborted', 'AbortError'));
			return;
		}

		const xhr = new XMLHttpRequest();

		if (options?.signal) {
			options.signal.addEventListener('abort', () => {
				xhr.abort();
				reject(new DOMException('Upload aborted', 'AbortError'));
			});
		}

		if (options?.onProgress) {
			xhr.upload.onprogress = (event) => {
				if (event.lengthComputable) {
					options.onProgress?.(Math.round((event.loaded / event.total) * 100));
				}
			};
		}

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					const data = JSON.parse(xhr.responseText) as MediaUploadResponse;
					resolve(data);
				} catch {
					reject(new Error('応答の解析に失敗しました'));
				}
			} else {
				try {
					const data = JSON.parse(xhr.responseText) as {error?: string};
					reject(new Error(data.error || `アップロードに失敗しました (${xhr.status})`));
				} catch {
					reject(new Error(`アップロードに失敗しました (${xhr.status})`));
				}
			}
		};

		xhr.onerror = () => {
			reject(new Error('通信エラーが発生しました'));
		};

		const formData = new FormData();
		formData.append('file', file);

		xhr.open('POST', '/api/media');
		const hostPassword = storage.getHostPassword();
		if (hostPassword) {
			xhr.setRequestHeader('X-Host-Password', hostPassword);
		}
		xhr.send(formData);
	});
};
