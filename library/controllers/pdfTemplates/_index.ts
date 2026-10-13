import express from 'express';
import { aiBuildTemplate } from './ai.controller.js';
import { adminPermissions, adminProtect } from '../../../middleware/index.js';
import {
	addStarters,
	createTemplate,
	deleteTemplate,
	duplicateTemplate,
	getFields,
	getSettings,
	getTemplate,
	guess,
	listGallery,
	listTemplates,
	renderSample,
	saveSettings,
	setDefault,
	updateTemplate,
	useTemplate,
} from './pdfTemplates.controller.js';

/** A handler's failure answers 500 instead of reaching the process. */
const safe =
	(fn: (req: any, res: any) => Promise<any>) =>
	(req: any, res: any) =>
		fn(req, res).catch((e: any) => {
			console.error('pdf-templates:', e?.message);
			if (!res.headersSent) res.status(500).json({ message: 'Something went wrong' });
		});

/**
 * /pdf-templates (docs/pdf-templates D11). Reading — the list, a template,
 * the gallery, previews with sample data, the field picker — is for anyone
 * signed in (layouts only; no records). Making and changing templates and the
 * business details is building. Records are printed by each page's own
 * POST /<route>/export/template.
 */
export const makePdfTemplatesRouter = ({ read, edit }: { read: any[]; edit: any[] }) => {
	const router = express.Router();
	router.get('/', ...read, safe(listTemplates));
	router.get('/settings', ...read, safe(getSettings));
	router.put('/settings', ...read, ...edit, safe(saveSettings));
	router.get('/gallery', ...read, safe(listGallery));
	router.post('/gallery/starters', ...read, ...edit, safe(addStarters));
	router.get('/fields/:route(*)', ...read, safe(getFields));
	router.post('/render', ...read, safe(renderSample));
	router.post('/guess', ...read, ...edit, safe(guess));
	router.post('/use', ...read, ...edit, safe(useTemplate));
	router.post('/ai', ...read, ...edit, safe(aiBuildTemplate));
	router.post('/', ...read, ...edit, safe(createTemplate));
	router.get('/:id', ...read, safe(getTemplate));
	router.put('/:id', ...read, ...edit, safe(updateTemplate));
	router.delete('/:id', ...read, ...edit, safe(deleteTemplate));
	router.post('/:id/default', ...read, ...edit, safe(setDefault));
	router.post('/:id/duplicate', ...read, ...edit, safe(duplicateTemplate));
	return router;
};

export default makePdfTemplatesRouter({ read: [adminProtect], edit: [adminPermissions(['edit-builder'])] });
