import {describe, expect, it} from 'vitest';
import {
	ALLOWED_AUDIO_MIMES,
	ALLOWED_IMAGE_MIMES,
	getMaxFileSizeForMime,
	getMediaType,
	isAllowedMime,
	MAX_AUDIO_SIZE,
	MAX_IMAGE_SIZE,
	mediaUrl,
} from './media.ts';

describe('media helpers', () => {
	it('画像と音声の MIME タイプを正しく識別できる', () => {
		for (const mime of Object.keys(ALLOWED_IMAGE_MIMES)) {
			expect(getMediaType(mime)).toBe('image');
			expect(isAllowedMime(mime)).toBe(true);
			expect(getMaxFileSizeForMime(mime)).toBe(MAX_IMAGE_SIZE);
		}
		for (const mime of Object.keys(ALLOWED_AUDIO_MIMES)) {
			expect(getMediaType(mime)).toBe('audio');
			expect(isAllowedMime(mime)).toBe(true);
			expect(getMaxFileSizeForMime(mime)).toBe(MAX_AUDIO_SIZE);
		}
		expect(getMediaType('application/pdf')).toBeNull();
		expect(isAllowedMime('application/pdf')).toBe(false);
		expect(getMaxFileSizeForMime('application/pdf')).toBe(0);
	});

	it('mediaUrl は正しい URL を返す', () => {
		expect(mediaUrl('abc-123')).toBe('/api/media/abc-123');
		expect(mediaUrl('')).toBe('');
		expect(mediaUrl('hello/world')).toBe('/api/media/hello%2Fworld');
	});
});
