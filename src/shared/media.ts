/** 許可する画像の MIME タイプと拡張子 */
export const ALLOWED_IMAGE_MIMES: Record<string, string> = {
	'image/png': '.png',
	'image/jpeg': '.jpg',
	'image/webp': '.webp',
	'image/gif': '.gif',
};

/** 許可する音声の MIME タイプと拡張子 */
export const ALLOWED_AUDIO_MIMES: Record<string, string> = {
	'audio/mpeg': '.mp3',
	'audio/mp4': '.mp4',
	'audio/x-m4a': '.m4a',
	'audio/wav': '.wav',
	'audio/ogg': '.ogg',
	'audio/webm': '.webm',
};

/** 許可する全 MIME タイプと拡張子の対応 */
export const ALLOWED_MIMES: Record<string, string> = {
	...ALLOWED_IMAGE_MIMES,
	...ALLOWED_AUDIO_MIMES,
};

/** 画像の最大ファイルサイズ (20MB) */
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

/** 音声の最大ファイルサイズ (100MB) */
export const MAX_AUDIO_SIZE = 100 * 1024 * 1024;

/** 全体リクエストボディの制限 (105MB: 100MB + multipart オーバーヘッド) */
export const MAX_BODY_LIMIT = 105 * 1024 * 1024;

export type MediaType = 'image' | 'audio';

export interface MediaMetadata {
	id: string;
	mimeType: string;
	size: number;
	originalName: string;
	createdAt: number;
}

export interface MediaUploadResponse {
	id: string;
	mimeType: string;
	size: number;
	originalName: string;
}

/** MIME タイプが画像か音声かを判定する */
export const getMediaType = (mime: string): MediaType | null => {
	if (mime in ALLOWED_IMAGE_MIMES) return 'image';
	if (mime in ALLOWED_AUDIO_MIMES) return 'audio';
	return null;
};

/** MIME タイプが許可されているかを判定する */
export const isAllowedMime = (mime: string): boolean => {
	return mime in ALLOWED_MIMES;
};

/** MIME タイプに応じた最大許容サイズを返す */
export const getMaxFileSizeForMime = (mime: string): number => {
	const type = getMediaType(mime);
	if (type === 'image') return MAX_IMAGE_SIZE;
	if (type === 'audio') return MAX_AUDIO_SIZE;
	return 0;
};

/** メディアの配信 URL を生成する */
export const mediaUrl = (id: string): string => {
	if (!id) return '';
	return `/api/media/${encodeURIComponent(id)}`;
};
