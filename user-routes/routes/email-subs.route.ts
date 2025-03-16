import express from 'express';
import {
	checkEmailExists,
	commonRouter,
	EmailSubscriptionSettings as settings,
	EmailSubscription as Model,
} from '../../imports';
const router = express.Router();

router.use(
	'/',
	commonRouter({
		Model: Model,
		settings: settings,
		permission: 'email-subscription',
		injectMiddleware: {
			post: [checkEmailExists({ Model })],
		},
	})
);
// if other endpoint comes after / , then it goes here
// like this --> /blog
export default router;
