import { Response, Request } from 'express';

const getSelf = ({ model, populate }: { model: any; populate?: any }) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			let query = model.findById(req.user._id);
			if (populate) query = query.populate(populate);

			query.select('-password');
			const data = await query.exec();

			if (!data) {
				return res.status(404).json({ message: 'User Not Found' });
			}

			return res.status(200).json(data);
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getSelf;
