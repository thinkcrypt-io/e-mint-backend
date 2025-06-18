import { Response } from 'express';
import sidebar from '../../lib/data/sidebar.data.js';

const getSidebar = () => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const bar = sidebar;
			return res.status(200).json(bar);
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getSidebar;
