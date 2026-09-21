import { vercelClient, withTeam } from './client.js';

export type VercelTeamSummary = {
	teamId: string;
	slug: string | null;
	name: string | null;
	avatar: string | null;
	createdAt: string | null;
};

export type VercelTeamMember = {
	uid: string;
	name: string | null;
	username: string | null;
	email: string | null;
	role: string | null;
	confirmed: boolean;
};

const toTeamSummary = (data: any): VercelTeamSummary => ({
	teamId: data?.id,
	slug: data?.slug || null,
	name: data?.name || null,
	avatar: data?.avatar || null,
	createdAt: data?.createdAt ? new Date(data.createdAt).toISOString() : null,
});

/**
 * GET /v2/teams.
 *
 * **An empty array is the normal answer, not an error.** On a personal Hobby
 * account there are no teams, every call then runs with no `teamId`, and that
 * is the correct scope rather than a fallback. Nothing downstream may treat
 * `[]` as a failure or as an empty state that needs fixing.
 */
export const listTeams = async (token: string): Promise<VercelTeamSummary[]> => {
	const { data } = await vercelClient(token).get('/v2/teams');
	const teams: VercelTeamSummary[] = (data?.teams || []).map(toTeamSummary);

	return teams.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
};

/** GET /v2/teams/{teamId}. Never called on a personal account. */
export const getTeam = async (token: string, team: string): Promise<VercelTeamSummary> => {
	const { data } = await vercelClient(token).get(`/v2/teams/${encodeURIComponent(team)}`);
	return toTeamSummary(data);
};

/**
 * GET /v2/teams/{teamId}/members.
 *
 * Written for a Pro account that may be connected later. There is no members
 * screen: team membership does not exist on a personal account, and a tab that
 * is always empty is worse than one that is absent.
 */
export const listTeamMembers = async (
	token: string,
	team: string
): Promise<VercelTeamMember[]> => {
	const { data } = await vercelClient(token).get(
		`/v2/teams/${encodeURIComponent(team)}/members`,
		{ params: withTeam({}, team) }
	);

	return (data?.members || []).map((m: any) => ({
		uid: m?.uid,
		name: m?.name || null,
		username: m?.username || null,
		email: m?.email || null,
		role: m?.role || null,
		confirmed: !!m?.confirmed,
	}));
};
