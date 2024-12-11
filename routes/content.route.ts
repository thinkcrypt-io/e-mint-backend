// Import necessary modules from their respective files
import express from 'express';
import constructConfig from '../lib/configurator/constructConfig.js';

import { protect, sort, query, validate, hasPermission } from '../middleware/index.js';

import getContent from '../controllers/content/getContent.controller.js';
import updateContent from '../controllers/content/updateContent.controller.js';
import addProductList from '../controllers/content/addProductList.controller.js';
import deleteProductList from '../controllers/content/deleteProductListController.js';
import editProductList from '../controllers/content/editProductListController.js';

import getContentHongo from '../controllers/hongo/getContent.controller.js';
import updateContentHongo from '../controllers/hongo/updateContent.controller.js';
import addProductListHongo from '../controllers/hongo/addProductList.controller.js';
import deleteProductListHongo from '../controllers/hongo/deleteProductListController.js';
import editProductListHongo from '../controllers/hongo/editProductListController.js';

// Initialize a new router
const router = express.Router();

//NEXA THEME
router.get('/', protect, getContent);
router.put('/', protect, updateContent);
router.post('/product', protect, addProductList);
router.delete('/product/:id', protect, deleteProductList);
router.put('/product/:id', protect, editProductList);

//HONGO THEME
router.get('/hongo', protect, getContentHongo);
router.put('/hongo', protect, updateContentHongo);
router.post('/product/hongo', protect, addProductListHongo);
router.delete('/product/hongo/:id', protect, deleteProductListHongo);
router.put('/product/hongo/:id', protect, editProductListHongo);

export default router;
