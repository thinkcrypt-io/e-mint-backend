import { getErrorMessage } from '../../imports.js';
import { Deployment } from '../../models/index.js';
import { Vercel } from '@vercel/sdk';

const checkDomainConfig = async (req: any, res: any) => {
	try {
		const { id } = req.params;

		const deployment = await Deployment.findOne({ shop: req.shop });
		if (!deployment) return res.status(400).json({ message: 'Deployment not found' });

		const vercel = new Vercel({
			bearerToken: process.env.VERCEL_FULL_ACCESS,
		});

		const result = await vercel.domains.getDomainConfig({
			domain: id,
		});

		// const result = await vercel.domains.getDomain({
		// 	domain: id,
		// });

		// const result = await vercel.projects.getProjectDomain({
		// 	idOrName: deployment.vercelName,
		// 	domain: id,
		// });

		// const result = await vercel.projects.getProjectDomains({
		// 	idOrName: deployment.vercelName,
		// });

		// const result = await vercel.projects.verifyProjectDomain({
		// 	idOrName: deployment.vercelName,
		// 	domain: id,
		// });

		res.status(200).json(result);
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

export default checkDomainConfig;
