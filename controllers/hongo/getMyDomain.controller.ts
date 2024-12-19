import { getErrorMessage } from '../../imports.js';
import { Deployment } from '../../models/index.js';

const getMyDomain = async (req: any, res: any) => {
	try {
		const data = await Deployment.findOne({ shop: req.shop });

		if (!data) {
			return res.status(400).json({ message: `Data not found` });
		}

		return res.status(200).json(data);
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).json(message);
	}
};

export default getMyDomain;
