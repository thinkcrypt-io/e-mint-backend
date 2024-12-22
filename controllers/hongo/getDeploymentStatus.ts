import { getErrorMessage } from '../../imports.js';
import { Vercel } from '@vercel/sdk';

const BACKEND = 'https://e-mint-c5a78779aa41.herokuapp.com';

const getDeploymentStatus = async (req: any, res: any) => {
	try {
		const { id } = req.params;
		const vercel = new Vercel({
			bearerToken: process.env.VERCEL_TOKEN,
		});

		const result = await vercel.deployments.getDeployment({
			idOrUrl: id,
			withGitRepoInfo: 'true',
		});

		res.status(200).json(result);
	} catch (e: any) {
		const message = getErrorMessage(e);
		console.log(e);
		return res.status(500).json({ message });
	}
};

export default getDeploymentStatus;
