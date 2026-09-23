import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {ALLOWED_AUDIO_MIMES, ALLOWED_IMAGE_MIMES} from '../../shared/media.ts';
import {MediaInput} from './MediaInput.tsx';

describe('MediaInput', () => {
	it('画像タイプで未選択時、ファイル入力が表示され画像用 accept が設定される', () => {
		const html = renderToStaticMarkup(
			<MediaInput type="image" label="イラスト画像" onChange={() => {}} />,
		);

		expect(html).toContain('イラスト画像');
		expect(html).toContain('type="file"');
		expect(html).toContain(`accept="${Object.keys(ALLOWED_IMAGE_MIMES).join(',')}"`);
		expect(html).not.toContain('<img');
	});

	it('音声タイプで未選択時、ファイル入力が表示され音声用 accept が設定される', () => {
		const html = renderToStaticMarkup(
			<MediaInput type="audio" label="問題音声" onChange={() => {}} />,
		);

		expect(html).toContain('問題音声');
		expect(html).toContain('type="file"');
		expect(html).toContain(`accept="${Object.keys(ALLOWED_AUDIO_MIMES).join(',')}"`);
		expect(html).not.toContain('<audio');
	});

	it('画像が選択済みの場合、プレビュー img と削除ボタンが表示される', () => {
		const html = renderToStaticMarkup(
			<MediaInput type="image" value="img123" label="イラスト" onChange={() => {}} />,
		);

		expect(html).toContain('イラスト');
		expect(html).toContain('<img src="/api/media/img123"');
		expect(html).toContain('削除');
		expect(html).not.toContain('type="file"');
	});

	it('音声が選択済みの場合、プレビュー audio と削除ボタンが表示される', () => {
		const html = renderToStaticMarkup(
			<MediaInput type="audio" value="audio456" label="リスニング" onChange={() => {}} />,
		);

		expect(html).toContain('リスニング');
		expect(html).toContain('<audio controls="" src="/api/media/audio456"');
		expect(html).toContain('削除');
		expect(html).not.toContain('type="file"');
	});
});
