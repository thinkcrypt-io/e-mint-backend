import { getErrorMessage } from '../../imports.js';
import { Deployment } from '../../models/index.js';
import { Vercel } from '@vercel/sdk';

const BACKEND = 'https://e-mint-c5a78779aa41.herokuapp.com';

const addEnvController = async (req: any, res: any) => {
	try {
		const vercel = new Vercel({
			bearerToken: process.env.VERCEL_TOKEN,
		});
		const result = await vercel.aliases.getAlias({
			idOrAlias: 'saclo-clothing',
		});

		res.status(200).json(result);
	} catch (e: any) {
		const message = getErrorMessage(e);
		console.log(e);
		return res.status(500).json({ message });
	}
};

export default addEnvController;
