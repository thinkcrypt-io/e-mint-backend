import { getErrorMessage } from '../../imports.js';
import { Shop, Deployment, PurchasedTheme } from '../../models/index.js';
import { Vercel } from '@vercel/sdk';

const GIT_REPO = 'hongo';
const ORG_NAME = 'aiasifistiaque';
const BRANCH = 'main';
const BACKEND = 'https://e-mint-c5a78779aa41.herokuapp.com';

const deployProject = async (req: any, res: any) => {
	try {
		const { slug } = req.body;

		if (!slug) {
			return res.status(400).json({ message: 'Name is required' });
		}

		const vercel = new Vercel({
			bearerToken: process.env.VERCEL_TOKEN,
		});

		const getShop = await Shop.findById(req.shop);
		if (!getShop) return res.status(404).json({ message: 'Shop not found' });

		const getActiveTheme = (await PurchasedTheme.findById(getShop.activeTheme).populate(
			'theme deployment'
		)) as any;

		if (!getActiveTheme)
			return res.status(404).json({ message: 'No active theme found for this shop' });

		const theme = getActiveTheme.theme.slug;
		const gitRepo = getActiveTheme.theme.gitRepo;

		if (!theme) return res.status(404).json({ message: 'No active theme found for this shop' });

		const queryHelper = (req as any).queryHelper || {};

		const findDeployment = await Deployment.findOne({ slug });

		if (findDeployment)
			return res.status(400).json({ message: 'Name not available, try a different name' });

		const shop = await Shop.findOne({ _id: req.shop });
		if (!shop) return res.status(400).json({ message: 'Shop not found' });

		// const findIfStoreHasDeployment = await Deployment.findOne({ shop: req.shop });
		// if (findIfStoreHasDeployment)
		// 	return res.status(400).json({ message: 'Store already has a deployment' });

		const createResponse = await vercel.projects.createProject({
			requestBody: {
				name: slug,
				framework: 'nextjs',
				gitRepository: {
					repo: `aiasifistiaque/${gitRepo || GIT_REPO}`,
					type: 'github',
				},
			},
		});

		const addResponse = await vercel.projects.createProjectEnv({
			idOrName: createResponse.name,
			upsert: 'true',
			requestBody: [
				{
					key: 'NEXT_PUBLIC_STORE',
					value: shop.id,
					target: ['production', 'preview', 'development'],
					type: 'plain',
				},
				{
					key: 'NEXT_PUBLIC_BACKEND',
					value: BACKEND,
					target: ['production', 'preview', 'development'],
					type: 'plain',
				},
				{
					key: 'NEXT_PUBLIC_TOKEN_NAME',
					value: `MINT_${theme.toUpperCase()}_THEME_${shop.id}`,
					target: ['production', 'preview', 'development'],
					type: 'plain',
				},
			],
		});

		const createDeployment = await vercel.deployments.createDeployment({
			requestBody: {
				name: createResponse.name,
				target: 'production',
				gitSource: {
					type: 'github',
					repo: gitRepo || GIT_REPO,
					ref: BRANCH,
					org: ORG_NAME,
				},
				projectSettings: {
					framework: 'nextjs',
					buildCommand: 'next build',
					devCommand: 'next dev',
					installCommand: 'npm install',
					outputDirectory: '.next',
				},
			},
		});
		// const domain = await vercel.aliases.getAlias({
		// 	idOrAlias: createResponse.name,
		// });

		// Add a new domain

		const addDomainResponse = await vercel.projects.addProjectDomain({
			idOrName: createResponse.name, //The project name used in the deployment URL
			requestBody: {
				name: `${createResponse.name}.mintapp.store`,
			},
		});

		const deployment = new Deployment({
			shop: req.shop,
			shopId: shop.id,
			slug,
			gitRepo: gitRepo,
			gitBranch: BRANCH,
			gitOrg: ORG_NAME,
			domain: addDomainResponse.name,
			// vercelURI: domain.alias,
			vercelId: createResponse.id,
			vercelName: createResponse.name,
			deployUrl: createDeployment.url,
			theme: theme,
			deploymentId: createDeployment.id,
		});

		const saved = await deployment.save();
		shop.deployment = saved._id;
		getActiveTheme.deployment = saved._id;
		getActiveTheme.isDeployed = true;

		await shop.save();
		await getActiveTheme.save();

		res.status(200).json({
			project: createResponse,
			deployment: saved,
			env: addResponse,
			vercelDeployment: createDeployment,
			// domain: domain,
			addDomainResponse: addDomainResponse,
		});
	} catch (e: any) {
		const message = getErrorMessage(e);
		console.log(e);
		return res.status(500).json({ message });
	}
};

export default deployProject;
