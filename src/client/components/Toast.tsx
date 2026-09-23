import {createContext, type ReactNode, useCallback, useContext, useState} from 'react';
import styles from './Toast.module.css';

interface ToastItem {
	id: number;
	message: string;
	kind: 'info' | 'error';
}

type Notify = (message: string, kind?: ToastItem['kind']) => void;

const ToastContext = createContext<Notify>(() => {});

let nextId = 0;

export const ToastProvider = ({children}: {children: ReactNode}) => {
	const [items, setItems] = useState<ToastItem[]>([]);

	const notify = useCallback<Notify>((message, kind = 'info') => {
		const id = nextId++;
		setItems((prev) => [...prev, {id, message, kind}]);
		setTimeout(() => setItems((prev) => prev.filter((item) => item.id !== id)), 4000);
	}, []);

	return (
		<ToastContext value={notify}>
			{children}
			<div className={styles.container} aria-live="polite">
				{items.map((item) => (
					<div key={item.id} className={item.kind === 'error' ? styles.error : styles.info}>
						{item.message}
					</div>
				))}
			</div>
		</ToastContext>
	);
};

export const useNotify = () => useContext(ToastContext);

/** 非同期処理を実行し、失敗したらエラーを通知する */
export const useRun = () => {
	const notify = useNotify();
	return useCallback(
		async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
			try {
				return await action();
			} catch (error) {
				notify(error instanceof Error ? error.message : String(error), 'error');
				return undefined;
			}
		},
		[notify],
	);
};
