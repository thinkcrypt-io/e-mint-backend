import { herokuClient } from './client.js';

export type HerokuDyno = {
	id: string;
	name: string;
	type: string;
	size: string;
	state: string;
	command: string;
	releaseVersion: number | null;
	updatedAt: string | null;
	createdAt: string | null;
};

export type HerokuFormation = {
	id: string;
	type: string;
	size: string;
	quantity: number;
	command: string;
};

const toDyno = (data: any): HerokuDyno => ({
	id: data?.id,
	name: data?.name,
	type: data?.type,
	size: data?.size,
	state: data?.state,
	command: data?.command || '',
	releaseVersion: data?.release?.version ?? null,
	updatedAt: data?.updated_at || null,
	createdAt: data?.created_at || null,
});

const toFormation = (data: any): HerokuFormation => ({
	id: data?.id,
	type: data?.type,
	size: data?.size,
	quantity: data?.quantity,
	command: data?.command || '',
});

/** GET /apps/{app}/dynos */
export const listDynos = async (token: string, app: string): Promise<HerokuDyno[]> => {
	const { data } = await herokuClient(token).get(`/apps/${encodeURIComponent(app)}/dynos`);
	return (data || []).map(toDyno);
};

/** GET /apps/{app}/formation — the process types and their scale. */
export const getFormation = async (token: string, app: string): Promise<HerokuFormation[]> => {
	const { data } = await herokuClient(token).get(`/apps/${encodeURIComponent(app)}/formation`);
	return (data || []).map(toFormation);
};

/**
 * PATCH /apps/{app}/formation — scale process types.
 *
 * Scaling up past the free allowance costs money immediately, and scaling a
 * paid dyno size requires a verified account. Both failures come back from
 * Heroku as a readable message, which `toHerokuError` passes through — the UI
 * must show it rather than a generic "scaling failed".
 */
export const updateFormation = async (
	token: string,
	app: string,
	updates: { type: string; quantity?: number; size?: string }[]
): Promise<HerokuFormation[]> => {
	const { data } = await herokuClient(token).patch(`/apps/${encodeURIComponent(app)}/formation`, {
		updates,
	});

	return (data || []).map(toFormation);
};

/**
 * DELETE /apps/{app}/dynos — restart every dyno.
 *
 * Heroku models a restart as deleting the dynos; the formation brings them
 * straight back. It answers 202 with an empty body.
 */
export const restartAll = async (token: string, app: string): Promise<void> => {
	await herokuClient(token).delete(`/apps/${encodeURIComponent(app)}/dynos`);
};

/** DELETE /apps/{app}/dynos/{dyno} — restart one, by name (`web.1`) or id. */
export const restartOne = async (token: string, app: string, dyno: string): Promise<void> => {
	await herokuClient(token).delete(
		`/apps/${encodeURIComponent(app)}/dynos/${encodeURIComponent(dyno)}`
	);
};
