import { Response } from 'express';

const getDistinctFields = ({ model }: any) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			let query: any = req?.queryHelper || {};

			const { key } = req.params;

			if (!key) return res.status(400).json({ message: 'Key parameter is required' });

			const listQuery = model.distinct(key, query);
			const doc = await listQuery.exec();

			return res.status(200).json(doc);
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getDistinctFields;
