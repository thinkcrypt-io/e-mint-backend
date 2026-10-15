import TenantProject from '../models/tenancy/tenantProject.model.js';
import { currentScope, runInScope } from './tenantScope.function.js';
import { fireWebhooks } from './webhooks.function.js';

/**
 * What follows a record going live or coming off (docs/cms D10, CMS-09) —
 * from the panel (one or many), the site's Publish and MCP:
 *
 *   - the project's webhooks for `publish` / `unpublish` on that model, with
 *     what was published (or, taken off, the draft);
 *   - the project's site drops its cached pages, so the change shows on the
 *     next visit instead of when the cache runs out. Many publishes in a row
 *     (bulk Publish) make one refresh, a few seconds after the last.
 *
 * Both run after the response and never fail the publish.
 */

const REFRESH_AFTER_MS = () => Number(process.env.SITE_REFRESH_DELAY_MS) || 3000;
const pending = new Map<string, NodeJS.Timeout>();

/** The project's site refreshes once, a moment after the last call. */
export const refreshSiteSoon = () => {
	const scope = currentScope();
	if (!scope?.project) return;
	const key = String(scope.project);
	clearTimeout(pending.get(key));
	const timer = setTimeout(() => {
		pending.delete(key);
		runInScope(scope, async () => {
			const project: any = await TenantProject.findById(scope.project, { publicSlug: 1, type: 1 }).lean();
			if (!project?.publicSlug) return;
			// Imported here: the site builder's publishing pulls in most of the site code.
			const { revalidateSite } = await import('../siteBuilder/publish.js');
			await revalidateSite(project);
		}).catch((e: any) => console.error('site refresh:', e?.message));
	}, REFRESH_AFTER_MS());
	timer.unref?.();
	pending.set(key, timer);
};

/**
 * One record published or taken off. `Model` is its compiled model; `doc` what
 * the webhooks send — the published snapshot, or the draft when taken off.
 */
export const afterPublish = (Model: any, event: 'publish' | 'unpublish', doc: any, { source = 'panel', refresh = true }: { source?: 'panel' | 'api'; refresh?: boolean } = {}) => {
	if (doc) fireWebhooks({ model: Model?.modelName, event, doc, source });
	// The site's own Publish refreshes it itself.
	if (refresh) refreshSiteSoon();
};
