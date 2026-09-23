const PREFIX = 'summercamp-quiz';

const get = (key: string) => {
	try {
		return localStorage.getItem(`${PREFIX}:${key}`);
	} catch {
		return null;
	}
};

const set = (key: string, value: string | null) => {
	try {
		if (value === null) {
			localStorage.removeItem(`${PREFIX}:${key}`);
		} else {
			localStorage.setItem(`${PREFIX}:${key}`, value);
		}
	} catch {
		// プライベートブラウズなどで保存できなくても続行する
	}
};

export const storage = {
	getHostPassword: () => get('host-password') ?? '',
	setHostPassword: (password: string | null) => set('host-password', password),
	getToken: (gameId: string) => get(`token:${gameId}`),
	setToken: (gameId: string, token: string | null) => set(`token:${gameId}`, token),
};
