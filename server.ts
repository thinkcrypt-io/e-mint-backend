import express, { Application } from 'express';
import dotenv from 'dotenv';
import connectDb from './db.js';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import requestIp from 'request-ip';

//import routes

import adminRouter from './routes-admin/admin.router.js';
import userRouter from './user-routes/user.router.js';
import appRouter from './app-route/app.router.js';
import sellerApi from './seller-api/sellerApi.js';
import staffApi from './staff/router.js';

//User Routes

const app: Application = express();

dotenv.config();
app.use(helmet());

app.use(
	express.json({
		limit: '50mb',
	})
);

const allowedOrigins = ['http://localhost:3000', 'http://example.com', 'http://localhost:3001'];

app.use(cors());
app.use(morgan('combined'));
app.use(requestIp.mw());

connectDb();

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

app.use('/admin/api', adminRouter);
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
