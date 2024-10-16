import { Response } from 'express';
import { Filter, FilterResponse } from '../../lib/types/filter.types.js';
import mongoose from 'mongoose';

const getFilters = ({
	filters,
	role = 'user',
	baseModel,
}: {
	filters: Filter[];
	role?: string;
	baseModel: mongoose.Model<any>;
}) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			let query: any = (req as any).queryHelper || {};

			let filtersToSend: FilterResponse[] = [];

			for (const filter of filters) {
				const { key, model, category, roles, ...rest } = filter;
				let newFilter = { ...rest };

				if (filter?.roles && !filter.roles.includes(role)) {
					continue; // Skip this iteration if the user's role is not included in the roles array
				}

				if (filter?.category === 'model') {
					const myModel = filter?.model || baseModel;
					const modelData = await myModel.find(query).sort('name');
					newFilter.options = modelData.map((item: any) => ({
						value: item._id,
						label: item[filter.key],
					}));
				}

				if (filter?.category === 'distinct') {
					const myModel = filter?.model || baseModel;
					const modelData = await myModel.distinct(filter?.key);
					newFilter.options = modelData.map((item: any) => ({
						value: item,
						label: item,
					}));
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
};

export default getFilters;
