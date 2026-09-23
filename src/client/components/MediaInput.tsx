import {type ChangeEvent, useEffect, useId, useRef, useState} from 'react';
import {
	ALLOWED_AUDIO_MIMES,
	ALLOWED_IMAGE_MIMES,
	type MediaType,
	mediaUrl,
} from '../../shared/media.ts';
import {uploadMedia} from '../lib/media.ts';
import styles from './MediaInput.module.css';

export interface MediaInputProps {
	/** メディアID */
	value?: string | undefined;
	/** メディアID変更コールバック (削除時は undefined) */
	onChange: (mediaId: string | undefined) => void;
	/** メディア種別 ('image' または 'audio') */
	type: MediaType;
	/** ラベル */
	label?: string;
	/** 無効化フラグ */
	disabled?: boolean;
}

const ACCEPT_MAP: Record<MediaType, string> = {
	image: Object.keys(ALLOWED_IMAGE_MIMES).join(','),
	audio: Object.keys(ALLOWED_AUDIO_MIMES).join(','),
};

export const MediaInput = ({value, onChange, type, label, disabled = false}: MediaInputProps) => {
	const inputId = useId();
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const abortControllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => {
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, []);

	const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		setError(null);
		setUploading(true);
		setProgress(0);

		const abortController = new AbortController();
		abortControllerRef.current = abortController;

		try {
			const res = await uploadMedia(file, {
				onProgress: setProgress,
				signal: abortController.signal,
			});
			onChange(res.id);
		} catch (err) {
			if (abortController.signal.aborted) {
				return;
			}
			setError(err instanceof Error ? err.message : 'アップロードに失敗しました');
		} finally {
			setUploading(false);
			abortControllerRef.current = null;
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		}
	};

	const handleRemove = () => {
		onChange(undefined);
		setError(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleCancel = () => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setUploading(false);
		setProgress(0);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const accept = ACCEPT_MAP[type];

	return (
		<div className={styles.container}>
			{label &&
				(value ? (
					<span className={styles.label}>{label}</span>
				) : (
					<label htmlFor={inputId} className={styles.label}>
						{label}
					</label>
				))}

			{value ? (
				<div className={styles.preview}>
					{type === 'image' ? (
						<img src={mediaUrl(value)} alt="プレビュー" className={styles.image} />
					) : (
						<audio controls src={mediaUrl(value)} className={styles.audio}>
							<track kind="captions" />
						</audio>
					)}
					<div className={styles.actions}>
						<button
							type="button"
							onClick={handleRemove}
							disabled={disabled}
							className={styles.removeButton}
						>
							削除
						</button>
					</div>
				</div>
			) : (
				<div>
					<input
						ref={fileInputRef}
						id={inputId}
						type="file"
						accept={accept}
						onChange={handleFileSelect}
						disabled={disabled || uploading}
					/>
					{uploading && (
						<div className={styles.uploadProgress}>
							<progress value={progress} max={100} className={styles.progressBar} />
							<span className={styles.progressText}>{progress}%</span>
							<button type="button" onClick={handleCancel}>
								中止
							</button>
						</div>
					)}
				</div>
			)}

			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
		</div>
	);
};
