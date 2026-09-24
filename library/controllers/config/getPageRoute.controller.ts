import { Response } from 'express';
import { Page } from '../../models/_index.js';

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
				return res.status(200).json(config.route);
			}
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getPageRoute;
