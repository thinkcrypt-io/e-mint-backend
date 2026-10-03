import express, { Application } from 'express';
import dotenv from 'dotenv';
import connectDb from './db.js';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import requestIp from 'request-ip';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

//import routes

import adminRouter from './routes-admin/admin.router.js';
import { syncDynamicModels } from './library/functions/dynamicModels.function.js';
import { ensureTenantIndexes } from './library/functions/tenantIndexes.function.js';
import { seedStarterTemplates } from './library/functions/templateSeed.function.js';
import { schedulePreviewPurge } from './library/functions/templateSandbox.function.js';
import { scheduleTrashPurge } from './routes-admin/file/media.admin.route.js';
import userRouter from './user-routes/user.router.js';
import appRouter from './app-route/app.router.js';
import sellerApi from './seller-api/sellerApi.js';
import staffApi from './staff/router.js';
import mcpRouter from './library/controllers/mcp/mcp.router.js';
import tenantRouter from './routes-tenant/tenant.router.js';
import tenantMcpRouter from './routes-tenant/mcp.router.js';
import publicRouter from './routes-public/index.js';

//User Routes

const app: Application = express();

dotenv.config();
app.use(helmet());

// Load Swagger documentation
const swaggerDocument = YAML.load('./docs/swagger.yaml');

app.use(
	express.json({
		limit: '50mb',
	})
);

const allowedOrigins = ['http://localhost:3000', 'http://example.com', 'http://localhost:3001'];

app.use(cors());
// Before the request logger: a connector's URL can carry its API key (/mcp/emk_…).
app.use('/mcp', mcpRouter);
// A tenant project's MCP (docs/multi-tenancy WO-10) — also before the logger, for keys in the URL.
app.use('/tenant/mcp', tenantMcpRouter);
app.use(morgan('combined'));
app.use(requestIp.mw());

// Old databases' global unique indexes would refuse a project's `Client` (tenantIndexes.function.ts).
connectDb().then(() => {
	ensureTenantIndexes().catch(e => console.error(`Tenancy indexes: ${e.message}`));
	// The code starters as the first templates (docs/templates TD14), where missing.
	seedStarterTemplates();
	// Template previews older than 24 hours go, now and every hour (docs/templates T-04).
	schedulePreviewPurge();
});

// Swagger UI setup
app.use(
	'/api-docs',
	swaggerUi.serve,
	swaggerUi.setup(swaggerDocument, {
		customCss: '.swagger-ui .topbar { display: none }',
		customSiteTitle: 'E-Mint Admin API Documentation',
		swaggerOptions: {
			persistAuthorization: true,
			displayRequestDuration: true,
		},
	})
);

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
	console.log('Unhandled Rejection at:', promise, 'reason:', reason);
	process.exit(1);
});

process.on('uncaughtException', err => {
	console.log(`Error: ${err.message}`);
	process.exit(1);
});

app.use('/', (req, res, next) => {
	next();
});

const logger = async (req: any, res: any, next: any) => {
	try {
		const destPath = req.path.split('/').filter((p: string) => p);
		req.destPath = destPath?.[0];
		next();
	} catch (e) {
		next();
	}
};

app.use('/admin/api', logger, adminRouter);
// The tenant platform (docs/multi-tenancy): tenant users, organizations, projects.
app.use('/tenant/api', logger, tenantRouter);
// Tenant projects' public APIs and the customer login widget (docs/multi-tenancy WO-11).
app.use('/public', publicRouter);
app.use('/user-api', userRouter);
app.use('/app-api/', appRouter);
app.use('/api', sellerApi);
app.use('/staff-api/', staffApi);

//app.use('/api/orders', orderRoute);

app.use((req, res, next) => {
	return res
		.status(404)
		.json({ error: 'Not Found', message: 'The requested resource could not be found' });
});

const port: string | number = process.env.PORT || 5000;

app.listen(port, () => console.log(`Server running on Port: ${port}`));

scheduleTrashPurge();

// Compile the models built in the model builder now rather than on the first
// admin request, so code models that link to them can populate straight away.
syncDynamicModels({ app, force: true }).catch(e => console.error(`Model builder: ${e.message}`));
