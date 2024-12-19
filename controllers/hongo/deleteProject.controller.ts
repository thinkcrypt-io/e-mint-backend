import { getErrorMessage } from '../../imports.js';
import { Shop, Deployment } from '../../models/index.js';
import { Vercel } from '@vercel/sdk';

const deleteProject = async (req: any, res: any) => {
	try {
		const { id } = req.body;

		if (!id) {
			return res.status(404).json({ message: 'Deployment Not found' });
		}

		const vercel = new Vercel({
			bearerToken: process.env.VERCEL_TOKEN,
		});

		const findDeployment = await Deployment.findById(id);
		if (!findDeployment) return res.status(400).json({ message: 'Deployment Not found' });

		const shop = await Shop.findOne({ _id: req.shop });
		if (!shop) return res.status(400).json({ message: 'Shop not found' });

		const createResponse = await vercel.projects.deleteProject({
			idOrName: findDeployment.vercelName,
		});

		const saved = await Deployment.findByIdAndDelete(id);

		res.status(200).json({
			message: 'Project Deleted Successfully',
			response: 'createResponse',
		});
	} catch (e: any) {
		const message = getErrorMessage(e);
		console.log(e);
		return res.status(500).json({ message });
	}
};

export default deleteProject;
