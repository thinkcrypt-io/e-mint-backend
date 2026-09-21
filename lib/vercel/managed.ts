import Deployment from '../../models/deployment/Deployment.model.js';

/**
 * Which Vercel projects are live customer storefronts.
 *
 * `controllers/hongo` creates one Vercel project per shop and records it in the
 * `Deployment` model: `vercelId` holds the **Vercel project id**, `vercelName`
 * the project name, `shop` the owning shop. Those projects live on the same
 * Vercel account this console manages, so the console's project list *is* the
 * storefront list — and without this cross-reference, "Delete project" in an
 * admin tool reaches a paying customer's shop with nothing on screen saying so.
 *
 * This is the guard that makes the rest of the console safe to hand to someone
 * who did not build it.
 */

export type ManagedProject = {
	vercelId: string;
	vercelName: string;
	slug: string;
	shopId: string;
	shopName: string;
	domain: string;
};

/**
 * One query per page, not one per row.
 *
 * The project list renders up to a hundred rows and every one of them needs
 * this answer; a lookup per row would be a hundred round trips to Mongo for a
 * single table.
 */
export const findManagedProjects = async (
	vercelIds: string[]
): Promise<Record<string, ManagedProject>> => {
	const map: Record<string, ManagedProject> = {};

	if (!vercelIds || !vercelIds.length) return map;

	const rows = await Deployment.find({ vercelId: { $in: vercelIds } })
		// `name` must be selected explicitly or it comes back undefined and every
		// storefront renders with a blank shop name.
		.populate({ path: 'shop', select: 'name' })
		.lean();

	rows.forEach((row: any) => {
		if (!row?.vercelId) return;

		map[row.vercelId] = {
			vercelId: row.vercelId,
			vercelName: row.vercelName || '',
			slug: row.slug || '',
			shopId: row.shopId || '',
			shopName: row.shop?.name || row.slug || 'a shop',
			domain: row.domain || '',
		};
	});

	return map;
};

/** The single-project form, for a controller acting on one project. */
export const findManagedProject = async (
	vercelId: string
): Promise<ManagedProject | null> => {
	const map = await findManagedProjects([vercelId]);
	return map[vercelId] || null;
};

/**
 * The sentence shown when a destructive action is refused.
 *
 * Deleting a storefront from here would leave three dangling references —
 * the `Deployment` row, `Shop.deployment` and `PurchasedTheme.isDeployed` — and
 * a shop that still believes it is deployed. `controllers/hongo`'s own delete
 * flow is the one that unwinds all of it.
 */
export const storefrontRefusal = (managed: ManagedProject): string =>
	`This project is the live storefront for ${managed.shopName}. Deleting it here would leave the shop's records pointing at a project that no longer exists. Remove the storefront from the shop instead.`;
