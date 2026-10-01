/**
 * What else happens when a tenant project is created or deleted
 * (docs/multi-tenancy): the website kit seeds a website project (WO-18), the
 * tenant model registry forgets a deleted project's models (WO-08). Modules
 * register here instead of being imported by the projects router, which keeps
 * the import graph one-way.
 *
 * `created` runs inside the request, after the project's sidebar section and
 * dashboard exist; a throw undoes the whole project. `removed` runs after its
 * documents and collections are gone.
 */
type Created = (req: any, project: any) => Promise<void> | void;
type Removed = (projectId: any) => Promise<void> | void;

const onCreated: Created[] = [];
const onRemoved: Removed[] = [];

export const projectHooks = {
	onCreated: (fn: Created) => void onCreated.push(fn),
	onRemoved: (fn: Removed) => void onRemoved.push(fn),
	created: async (req: any, project: any) => {
		for (const fn of onCreated) await fn(req, project);
	},
	removed: async (projectId: any) => {
		for (const fn of onRemoved) await fn(projectId);
	},
};
