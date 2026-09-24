import { Response } from 'express';
import { Filter, FilterResponse } from '../../types/_index.js';
import mongoose from 'mongoose';
import { getActiveConfig } from '../../functions/resolveRoute.function.js';
import {
	filterRouteKey,
	resolveFilterModel,
} from '../../functions/routeRegistry.function.js';

const getFilters = ({
	filters,
	role = 'user',
	baseModel,
}: {
	filters: Filter[];
	role?: string;
	baseModel: mongoose.Model<any>;
}) => {
	const handler = async (req: any, res: Response): Promise<Response> => {
		try {
			let query: any = (req as any).queryHelper || {};

			// The active RouteConfig's filters (published, with its source on DB)
			// replace the settings filters outright — including an empty list, which is how a route is told to
			// show no filters at all. With no published config the settings still
			// apply, so a route nobody has configured behaves as it always did.
			const route = filterRouteKey(req);
			const published = route ? await getActiveConfig(route) : null;
			const source: any[] = Array.isArray(published?.data?.filters)
				? published!.data.filters
				: filters;

			let filtersToSend: FilterResponse[] = [];

			for (const filter of source) {
				const { key, model, category, roles, ...rest } = filter;
				let newFilter: any = { ...rest };

				if (roles?.length && !roles.includes(role)) {
					continue; // Skip this iteration if the user's role is not included in the roles array
				}

				if (category === 'model' || category === 'distinct') {
					const myModel = resolveFilterModel(model, baseModel);

					if (!myModel) {
						newFilter.options = [];
					} else if (category === 'model') {
						const modelData = await myModel.find(query).sort('name');
						newFilter.options = modelData.map((item: any) => ({
							value: item._id,
							label: item[key as string],
						}));
					} else {
						const modelData = await myModel.distinct(key as string);
						newFilter.options = modelData.map((item: any) => ({
							value: item,
							label: item,
						}));
					}
				}

				if (!newFilter.field) {
					newFilter.field = newFilter.name;
				}

				filtersToSend.push(newFilter);
			}

			return res.status(200).json(filtersToSend);
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};

	// Read by `collectFilterRoutes`, which walks the router stack to find every
	// route's settings filters — for seeding, and for the editor's defaults.
	return Object.assign(handler, { filterSource: { filters, role, baseModel } });
};

export default getFilters;
