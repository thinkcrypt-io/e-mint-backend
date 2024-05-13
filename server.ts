import express, { Application } from 'express';
import dotenv from 'dotenv';
import connectDb from './db.js';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

//import routes
import authRoute from './routes/auth.route.js';
import categoryRoute from './routes/categories.route.js';

import itemRoute from './routes/items.route.js';

const app: Application = express();

dotenv.config();
app.use(helmet());

app.use(
	express.json({
		limit: '50mb',
	})
);

const allowedOrigins = ['http://localhost:3000', 'http://example.com'];

app.use(cors());
app.use(morgan('combined'));

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
	console.log('Request URL:', `${req.method}: ${req.originalUrl}`);
	console.log('Request Time:', Date.now());
	console.log('Request IP:', req.ip);

	next();
});

//app.use('/api/orders', orderRoute);
app.use('/api/auth', authRoute);
app.use('/api/categories', categoryRoute);

app.use('/api/items', itemRoute);

app.use((req, res, next) => {
	return res
		.status(404)
		.json({ error: 'Not Found', message: 'The requested resource could not be found' });
});

const port: string | number = process.env.PORT || 5000;

app.listen(port, () => console.log(`Server running on Port: ${port}`));
