import {randomBytes} from 'node:crypto';
import {createReadStream, existsSync, mkdirSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {
	ALLOWED_MIMES,
	getMaxFileSizeForMime,
	getMediaType,
	isAllowedMime,
	MAX_BODY_LIMIT,
} from '../shared/media.ts';
import {isHostPasswordValid} from './auth.ts';
import type {Database} from './db.ts';

export interface MediaRouterOptions {
	db: Database;
	mediaDir: string;
	hostPassword: string;
}

export const createMediaRouter = (options: MediaRouterOptions) => {
	const {db, mediaDir, hostPassword} = options;
	mkdirSync(mediaDir, {recursive: true});

	const router = new Hono();

	// POST /: メディアアップロード
	router.post(
		'/',
		bodyLimit({
			maxSize: MAX_BODY_LIMIT,
			onError: (c) => c.json({error: 'ファイルサイズが大きすぎます'}, 413),
		}),
		async (c) => {
			const password = c.req.header('X-Host-Password');
			if (!isHostPasswordValid(hostPassword, password)) {
				return c.json({error: '司会者パスワードが違います'}, 401);
			}

			const body = await c.req.parseBody();
			const file = body.file;

			if (!(file instanceof File)) {
				return c.json({error: 'ファイルが指定されていません'}, 400);
			}

			const mimeType = file.type;
			if (!isAllowedMime(mimeType)) {
				return c.json({error: '許可されていないファイル形式です'}, 400);
			}

			const maxFileSize = getMaxFileSizeForMime(mimeType);
			if (file.size > maxFileSize) {
				const type = getMediaType(mimeType);
				const limitLabel = type === 'image' ? '20MB' : '100MB';
				return c.json({error: `ファイルサイズの上限 (${limitLabel}) を超えています`}, 413);
			}

			const id = randomBytes(12).toString('base64url');
			const ext = ALLOWED_MIMES[mimeType];
			const fileName = `${id}${ext}`;
			const filePath = join(mediaDir, fileName);

			const buffer = Buffer.from(await file.arrayBuffer());
			await writeFile(filePath, buffer);

			const metadata = {
				id,
				mimeType,
				size: file.size,
				originalName: file.name || fileName,
				createdAt: Date.now(),
			};
			db.insertMedia(metadata);

			return c.json(
				{
					id: metadata.id,
					mimeType: metadata.mimeType,
					size: metadata.size,
					originalName: metadata.originalName,
				},
				201,
			);
		},
	);

	// GET /:id: メディア取得 (Range リクエスト対応)
	router.get('/:id', async (c) => {
		const id = c.req.param('id');
		const media = db.findMedia(id);
		if (!media) {
			return c.json({error: 'メディアが見つかりません'}, 404);
		}

		const ext = ALLOWED_MIMES[media.mimeType];
		const filePath = join(mediaDir, `${media.id}${ext}`);
		if (!existsSync(filePath)) {
			return c.json({error: 'メディアファイルが見つかりません'}, 404);
		}

		const rangeHeader = c.req.header('range');
		const commonHeaders = {
			'Content-Type': media.mimeType,
			'Cache-Control': 'public, max-age=31536000, immutable',
			'Accept-Ranges': 'bytes',
		};

		if (!rangeHeader) {
			const stream = Readable.toWeb(
				createReadStream(filePath, {start: 0, end: Math.max(0, media.size - 1)}),
			);
			return c.body(stream, 200, {
				...commonHeaders,
				'Content-Length': String(media.size),
			});
		}

		const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
		if (!match) {
			return c.text('Range Not Satisfiable', 416, {
				'Content-Range': `bytes */${media.size}`,
			});
		}

		const startStr = match[1] ?? '';
		const endStr = match[2] ?? '';
		let start: number;
		let end: number;

		if (!startStr && !endStr) {
			return c.text('Range Not Satisfiable', 416, {
				'Content-Range': `bytes */${media.size}`,
			});
		}

		if (!startStr && endStr) {
			// bytes=-suffix
			const suffix = Number.parseInt(endStr, 10);
			if (suffix <= 0) {
				return c.text('Range Not Satisfiable', 416, {
					'Content-Range': `bytes */${media.size}`,
				});
			}
			start = Math.max(0, media.size - suffix);
			end = media.size - 1;
		} else if (startStr && !endStr) {
			// bytes=start-
			start = Number.parseInt(startStr, 10);
			end = media.size - 1;
		} else {
			// bytes=start-end
			start = Number.parseInt(startStr, 10);
			end = Number.parseInt(endStr, 10);
			if (end >= media.size) {
				end = media.size - 1;
			}
		}

		if (
			Number.isNaN(start) ||
			Number.isNaN(end) ||
			start > end ||
			start >= media.size ||
			start < 0
		) {
			return c.text('Range Not Satisfiable', 416, {
				'Content-Range': `bytes */${media.size}`,
			});
		}

		const contentLength = end - start + 1;
		const stream = Readable.toWeb(createReadStream(filePath, {start, end}));
		return c.body(stream, 206, {
			...commonHeaders,
			'Content-Range': `bytes ${start}-${end}/${media.size}`,
			'Content-Length': String(contentLength),
		});
	});

	return router;
};
