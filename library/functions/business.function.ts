import Joi from 'joi';
import { Schema } from 'mongoose';

/**
 * Business details (docs/pdf-templates D14): the organization's, edited on
 * Organization → Settings, and each project's own — copied from the
 * organization when the project is made, changed in Project settings or the
 * PDF designer. What invoices and receipts print as {{business.*}}.
 */

export const BUSINESS_KEYS = ['name', 'logo', 'address', 'phone', 'email', 'website', 'taxId'] as const;
export type Business = Record<(typeof BUSINESS_KEYS)[number], string>;

const MAX: Record<string, number> = { name: 160, logo: 1000, address: 600, phone: 60, email: 160, website: 300, taxId: 80 };

/** Mongoose: the details as a subdocument (the organization keeps its logo outside it — `withLogo` false). */
export const businessSchema = (withLogo = true) =>
	new Schema<any>(
		Object.fromEntries(BUSINESS_KEYS.filter(k => withLogo || k !== 'logo').map(k => [k, { type: String, trim: true, maxlength: MAX[k] }])),
		{ _id: false }
	);

/** Joi: the details a form sends — every key optional, empty allowed. */
export const businessJoi = (withLogo = true) =>
	Joi.object(Object.fromEntries(BUSINESS_KEYS.filter(k => withLogo || k !== 'logo').map(k => [k, Joi.string().trim().max(MAX[k]).allow('')])));

/** Every key, as text. */
export const cleanBusiness = (b: any): Business =>
	Object.fromEntries(BUSINESS_KEYS.map(k => [k, typeof b?.[k] === 'string' ? b[k].trim().slice(0, MAX[k]) : ''])) as Business;

/** The organization's details: its business profile, with the sign-up answers and its name and logo filling the gaps. */
export const orgBusiness = (org: any): Business =>
	cleanBusiness({
		...org?.business,
		name: org?.business?.name || org?.onboarding?.businessName || org?.name || '',
		website: org?.business?.website || org?.onboarding?.website || '',
		logo: org?.logo || '',
	});

/** A project's details: its own once it has them; a project made before them shows its organization's until saved. */
export const projectBusiness = (project: any, org: any): Business => (project?.business ? cleanBusiness(project.business) : orgBusiness(org));
