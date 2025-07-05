import { Response } from 'express';

type ConfigType = {
	table: string[];
	fields: string[];
	form: { sectionTitle: string; fields: (string | string[])[] }[];
	route?: any;
};

const getPageRoute = ({ config }: { config?: ConfigType }) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			if (!config?.route) {
				return res.status(400).json({ message: 'Configuration not provided' });
			} else {
				const pageConfig = config?.route;
				return res.status(200).json(pageConfig);
			}
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getPageRoute;
