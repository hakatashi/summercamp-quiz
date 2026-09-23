import {type FormEvent, type ReactNode, useEffect, useState} from 'react';
import {socket} from '../lib/socket.ts';
import {storage} from '../lib/storage.ts';
import styles from './HostGate.module.css';

/**
 * 司会者パスワードが必要なら入力させ、確認できたら children にパスワードを渡す。
 * パスワードは localStorage に保存し、次回から入力を省略する。
 */
export const HostGate = ({children}: {children: (password: string) => ReactNode}) => {
	const [password, setPassword] = useState(storage.getHostPassword);
	const [status, setStatus] = useState<'checking' | 'required' | 'ok'>('checking');
	const [input, setInput] = useState('');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		const check = async () => {
			try {
				const response = await socket.timeout(5000).emitWithAck('checkPassword', password);
				if (!active) return;
				if (response.ok && !response.required) {
					setStatus('ok');
				} else {
					setStatus('required');
					if (password !== '') setError('パスワードが違います');
				}
			} catch {
				if (active) setError('サーバーに接続できません');
			}
		};
		if (socket.connected) void check();
		socket.on('connect', check);
		return () => {
			active = false;
			socket.off('connect', check);
		};
	}, [password]);

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		storage.setHostPassword(input);
		setError(null);
		setStatus('checking');
		setPassword(input);
	};

	if (status === 'ok') {
		return children(password);
	}

	return (
		<div className={styles.container}>
			{status === 'checking' ? (
				<p>{error ?? '確認中…'}</p>
			) : (
				<form className={styles.form} onSubmit={onSubmit}>
					<h1>司会者パスワード</h1>
					<input
						type="password"
						value={input}
						onChange={(event) => setInput(event.target.value)}
						autoFocus
						autoComplete="current-password"
					/>
					<button type="submit">確認</button>
					{error && <p className={styles.error}>{error}</p>}
				</form>
			)}
		</div>
	);
};
