import { getErrorMessage } from '../../imports.js';
import { Deployment } from '../../models/index.js';
import { Vercel } from '@vercel/sdk';

const addDomainController = async (req: any, res: any) => {
	try {
		const { domain } = req.body;

		const deployment = await Deployment.findOne({ shop: req.shop });
		if (!deployment) return res.status(400).json({ message: 'Deployment not found' });

		const vercel = new Vercel({
			bearerToken: process.env.VERCEL_TOKEN,
		});

		const addDomainResponse = await vercel.projects.addProjectDomain({
			idOrName: deployment.vercelName, //The project name used in the deployment URL
			requestBody: {
				name: domain,
			},
		});

		res.status(200).json(addDomainResponse);
	} catch (e: any) {
		const message = getErrorMessage(e);

		const jsonPart = message.substring(message.indexOf('{'));

		// Step 2: Parse the JSON
		const parsedError = JSON.parse(jsonPart);

		// Step 3: Extract 'code' and 'message'
		const extractedData = {
			code: parsedError.error.code,
			message: parsedError.error.message,
		};

		return res.status(500).json(extractedData);
	}
};

export default addDomainController;
