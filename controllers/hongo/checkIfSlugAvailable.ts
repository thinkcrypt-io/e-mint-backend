import { getErrorMessage } from '../../imports.js';
import { Deployment } from '../../models/index.js';

const checkIfSlugAvailable = async (req: any, res: any) => {
	try {
		const { slug } = req.params;
		if (slug?.length < 3) {
			return res.status(400).json({ message: 'Subdomain name must be at least 3 characters' });
		}
		const deployment = await Deployment.findOne({ slug });

		if (deployment) {
			return res.status(400).json({ message: `${slug}.mintapp.store is not available` });
		}

		return res.status(200).json({ message: `${slug}.mintapp.store is available` });
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).json(message);
	}
};

export default checkIfSlugAvailable;
