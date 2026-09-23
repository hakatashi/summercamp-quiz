/**
 * 司会者パスワードを判定する。
 * expectedPassword が未設定 (空文字) なら誰でも司会者として認める。
 */
export const isHostPasswordValid = (
	expectedPassword: string,
	providedPassword: string | undefined,
): boolean => {
	return expectedPassword === '' || providedPassword === expectedPassword;
};
