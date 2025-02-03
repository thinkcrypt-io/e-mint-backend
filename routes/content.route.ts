// Import necessary modules from their respective files
import express from 'express';

import getContent from '../controllers/content/getContent.controller.js';
import updateContent from '../controllers/content/updateContent.controller.js';
import addProductList from '../controllers/content/addProductList.controller.js';
import deleteProductList from '../controllers/content/deleteProductListController.js';
import editProductList from '../controllers/content/editProductListController.js';

import {
	getContentHongo,
	updateContentHongo,
	addProductListHongo,
	deleteProductListHongo,
	editProductListHongo,
	deployProjectHongo,
	addHongoEnvController,
	addDomainController,
	checkDomainConfig,
} from '../controllers/hongo/index.js';

import Deploy, { settings as deploySettings } from '../models/deployment/Deployment.model.js';
import {
	constructConfig,
	validate,
	protect,
	getThemeContent,
	Pulse,
	updateThemeContent,
	addProductListToTheme,
	deleteProductListFromTheme,
	updateProductListInTheme,
	isExpired,
} from '../imports.js';
import checkIfSlugAvailable from '../controllers/hongo/checkIfSlugAvailable.js';

// Initialize a new router
const router = express.Router();

const hongoConfig = constructConfig({
	model: Deploy,
	config: deploySettings,
});

//NEXA THEME
router.get('/nexa', protect, getContent);
router.put('/nexa', protect, isExpired, updateContent);
router.post('/product/nexa', protect, isExpired, addProductList);
router.delete('/product/nexa/:id', protect, isExpired, deleteProductList);
router.put('/product/nexa/:id', protect, isExpired, editProductList);

//HONGO THEME
router.get('/hongo', protect, getContentHongo);
router.put('/hongo', protect, isExpired, updateContentHongo);

router.post('/product/hongo', protect, addProductListHongo);
router.delete('/product/hongo/:id', protect, isExpired, deleteProductListHongo);
router.put('/product/hongo/:id', protect, isExpired, editProductListHongo);

router.post('/deploy', protect, isExpired, deployProjectHongo);
router.post('/env/hongo', protect, addHongoEnvController);

//deployProject
router.post('/add-domain', protect, isExpired, addDomainController);

//check domain  config
router.get('/check-domain/:id', protect, checkDomainConfig);

//find if deployment exists
router.get('/deployments/:slug', checkIfSlugAvailable);

//Pulse THEME
router.get('/pulse', protect, getThemeContent(Pulse));
router.put('/pulse', protect, isExpired, updateThemeContent(Pulse));

router.post('/product/pulse', protect, isExpired, addProductListToTheme(Pulse));
router.delete('/product/pulse/:id', protect, isExpired, deleteProductListFromTheme(Pulse));
router.put('/product/pulse/:id', protect, isExpired, updateProductListInTheme(Pulse));

export default router;
