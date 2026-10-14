import { Response } from 'express';
import { Page } from '../../models/_index.js';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';

type ConfigType = {
	table: string[];
	fields: string[];
	form: { sectionTitle: string; fields: (string | string[])[] }[];
	route?: any;
};

const getPageRoute = ({ config, route }: { config?: ConfigType; route?: string }) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			if (!config?.route) {
				if (!route) {
					return res.status(400).json({ message: 'Route not provided' });
				}
				const getRoute = await Page.findOne({ path: route });
				if (!getRoute) {
					return res.status(404).json({ message: 'Page not found or configuration not provided' });
				}
				const routeConfig = {
					title: getRoute.name,
					subTitle: getRoute.subTitle,
					path: route,
					export: getRoute.export || false,
					button: {
						title: getRoute.buttonTitle || 'Add Item',
						isModal: getRoute.buttonIsModal || false,
					},
				};
				return res.status(200).json(routeConfig);
			} else {
				// A single type's page opens its one record instead of a table (docs/cms D2).
				const def: any = await ModelDefinition.findOne({ route: config.route.path || route }, { kind: 1, draftAndPublish: 1 }).lean();
				// …and a drafts model's records show their status, with Publish (docs/cms D5).
				return res.status(200).json({ ...config.route, ...(def?.kind === 'single' && { single: true }), ...(def?.draftAndPublish && { draftAndPublish: true }) });
			}
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getPageRoute;
