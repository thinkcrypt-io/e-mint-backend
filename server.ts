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
import productRoute from './routes/products.route.js';
import customerRoute from './routes/customers.route.js';
import orderRoute from './routes/order.route.js';
import roleRoute from './routes/role.route.js';
import permissionRoute from './routes/permission.route.js';
import userRoute from './routes/user.route.js';

import scanRoute from './routes/scans.route.js';
import restaurantRoute from './routes/restaurant.route.js';
import uploadRoute from './routes/upload.route.js';
import collectionRoute from './routes/collection.route.js';
import feedbackRoute from './routes/feedback.route.js';
import contentRoute from './routes/content.route.js';

import qrRoute from './routes/qr.route.js';

//User Routes
import userStoreRoute from './user-routes/store.user.route.js';
import userCategoryRoute from './user-routes/categories.user.route.js';
import userCollectionRoute from './user-routes/collections.user.route.js';
import userProductRoute from './user-routes/product.user.route.js';
import userAuthRoute from './user-routes/auth.user.route.js';
import userOrder from './user-routes/order.user.route.js';

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
	// console.log('Request URL:', `${req.method}: ${req.originalUrl}`);
	// console.log('Request Time:', Date.now());
	// console.log('Request IP:', req.ip);

	next();
});

//app.use('/api/orders', orderRoute);
app.use('/api/auth', authRoute);
app.use('/api/categories', categoryRoute);
app.use('/api/contents', contentRoute);

app.use('/api/items', itemRoute);
app.use('/api/products', productRoute);
app.use('/api/customers', customerRoute);

app.use('/api/restaurant', restaurantRoute);
app.use('/api/collections', collectionRoute);
app.use('/api/orders', orderRoute);
app.use('/api/roles', roleRoute);
app.use('/api/permissions', permissionRoute);
app.use('/api/users', userRoute);

app.use('/api/scans', scanRoute);
app.use('/api/upload', uploadRoute);
app.use('/api/feedbacks', feedbackRoute);
app.use('/api/qr', qrRoute);

//user routes
app.use('/user-api/store', userStoreRoute);
app.use('/user-api/categories', userCategoryRoute);
app.use('/user-api/collections', userCollectionRoute);
app.use('/user-api/products', userProductRoute);
app.use('/user-api/auth', userAuthRoute);
app.use('/user-api/orders', userOrder);

app.use((req, res, next) => {
	return res
		.status(404)
		.json({ error: 'Not Found', message: 'The requested resource could not be found' });
});

const port: string | number = process.env.PORT || 5000;

app.listen(port, () => console.log(`Server running on Port: ${port}`));
