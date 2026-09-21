export { vercelClient, withTeam, toVercelError, readRateLimit, VERCEL_API } from './client.js';
export type { VercelError, RateLimit } from './client.js';

export { pagedGet, pagedGetAll, MAX_PAGE } from './paginate.js';
export type { PageOptions, PagedResult } from './paginate.js';

export { cached, invalidate, clearAll, CACHE_TTL } from './cache.js';
export type { CacheKind } from './cache.js';

export { getUser, planFromCapability } from './account.js';
export type { VercelUserInfo } from './account.js';

export { listTeams, getTeam, listTeamMembers } from './teams.js';
export type { VercelTeamSummary, VercelTeamMember } from './teams.js';

export {
	listProjects,
	listAllProjects,
	getProject,
	createProject,
	updateProject,
	deleteProject,
	toProjectSummary,
} from './projects.js';
export type {
	VercelProjectSummary,
	VercelGitRepo,
	VercelDeploymentRef,
	CreateProjectInput,
} from './projects.js';

export {
	listEnv,
	getEnvValue,
	hydrateEnvValues,
	toEnvRecord,
	createEnv,
	updateEnv,
	deleteEnv,
	diffEnv,
	envIdentity,
	forTarget,
	toEnvFile,
	toJsonFile,
	ENV_TARGETS,
} from './env.js';
export type {
	VercelEnvRecord,
	VercelEnvTarget,
	VercelEnvType,
	EnvInput,
	EnvChange,
	StagedEnvRecord,
} from './env.js';

export {
	listDeployments,
	listAllDeployments,
	getDeployment,
	createDeployment,
	redeploy,
	cancelDeployment,
	deleteDeployment,
	promote,
	listPromoteAliases,
	getDeploymentEvents,
	listChecks,
	listDeploymentAliases,
	toDeployment,
} from './deployments.js';
export type { VercelDeployment, BuildLogEvent, GitSource } from './deployments.js';

export {
	listProjectDomains,
	addProjectDomain,
	verifyProjectDomain,
	removeProjectDomain,
	getDomainConfig,
	listAccountDomains,
} from './domains.js';
export type { VercelProjectDomain } from './domains.js';

export { getProjectResources, getAccountResources } from './resources.js';
export type {
	ProjectResources,
	AccountResources,
	ResourceSection,
	VercelStore,
	VercelIntegration,
} from './resources.js';

export { accountUsage, UNAVAILABLE_METRICS } from './usage.js';
export type { AccountUsage, UsageProject, UsageDay } from './usage.js';

export { findManagedProjects, findManagedProject, storefrontRefusal } from './managed.js';
export type { ManagedProject } from './managed.js';
