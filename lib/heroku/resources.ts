import { herokuClient } from './client.js';

export type HerokuAddon = {
	id: string;
	name: string;
	addonService: string;
	plan: string;
	state: string;
	/** Heroku reports this in cents per month. Left raw — the UI decides. */
	priceCents: number | null;
	webUrl: string | null;
	createdAt: string | null;
};

export type HerokuDomain = {
	id: string;
	hostname: string;
	kind: string;
	cname: string | null;
	status: string;
	acmStatus: string | null;
	createdAt: string | null;
};

export type HerokuCollaborator = {
	id: string;
	email: string;
	role: string | null;
	createdAt: string | null;
};

/** GET /apps/{app}/addons */
export const listAddons = async (token: string, app: string): Promise<HerokuAddon[]> => {
	const { data } = await herokuClient(token).get(`/apps/${encodeURIComponent(app)}/addons`);

	return (data || []).map((item: any) => ({
		id: item?.id,
		name: item?.name,
		addonService: item?.addon_service?.name || '',
		plan: item?.plan?.name || '',
		state: item?.state || '',
		priceCents: item?.plan?.price?.cents ?? null,
		webUrl: item?.web_url || null,
		createdAt: item?.created_at || null,
	}));
};

/** GET /apps/{app}/domains */
export const listDomains = async (token: string, app: string): Promise<HerokuDomain[]> => {
	const { data } = await herokuClient(token).get(`/apps/${encodeURIComponent(app)}/domains`);

	return (data || []).map((item: any) => ({
		id: item?.id,
		hostname: item?.hostname,
		kind: item?.kind || '',
		cname: item?.cname || null,
		status: item?.status || '',
		acmStatus: item?.acm_status || null,
		createdAt: item?.created_at || null,
	}));
};

/** GET /apps/{app}/collaborators */
export const listCollaborators = async (
	token: string,
	app: string
): Promise<HerokuCollaborator[]> => {
	const { data } = await herokuClient(token).get(`/apps/${encodeURIComponent(app)}/collaborators`);

	return (data || []).map((item: any) => ({
		id: item?.id,
		email: item?.user?.email || '',
		role: item?.role || null,
		createdAt: item?.created_at || null,
	}));
};
