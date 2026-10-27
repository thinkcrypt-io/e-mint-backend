import CommerceSettings from '../../models/tenancy/commerceSettings.model.js';
import { compiledModel } from '../dynamicModels.function.js';
import { currentScope } from '../tenantScope.function.js';
import { TenancyError } from '../tenancy.function.js';
import type { ModelKey } from './blueprint.js';
import type { Answers } from './settings.js';

/**
 * The built store, for the engine (docs/ecommerce EC-05…): its answers, and
 * each pre-built model by key — found through what the installer recorded,
 * never a fixed route or name. Read in the project's scope.
 */
export type Store = {
	answers: Answers;
	features: string[];
	installed: Record<string, { name: string; route: string; id: string }>;
	/** The compiled model for a key (throws if the store doesn't have it). */
	M: (key: ModelKey) => any;
	/** Whether a project model name / route is this key's. */
	is: (key: ModelKey, nameOrRoute: string) => boolean;
};

export const storeOf = async (): Promise<Store> => {
	if (!currentScope()?.project) throw new TenancyError(404, 'Only e-commerce projects have a store');
	const doc: any = await CommerceSettings.findOne({}).lean();
	if (doc?.status !== 'ready') throw new TenancyError(409, 'Set up your store first', 'store_not_ready');
	const installed = doc.installed || {};
	const plain = (n: string) => n.replace(/^T[a-f0-9]{24}_/, '');
	return {
		answers: doc.answers,
		features: doc.features || [],
		installed,
		M: key => {
			const Model = installed[key] && compiledModel(installed[key].name);
			if (!Model) throw new TenancyError(500, `The store’s ${key} model is missing`);
			return Model;
		},
		is: (key, x) => !!installed[key] && (installed[key].name === plain(x) || installed[key].route === x),
	};
};

/** A store's money, rounded to the currency's minor unit (two places; none for JPY-like currencies). */
export const roundFor = (currency: string) => {
	const places = ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF'].includes(String(currency).toUpperCase()) ? 0 : 2;
	const f = 10 ** places;
	return (n: number) => Math.round((Number(n) || 0) * f + Number.EPSILON) / f;
};

/** Who did it, for the store's logs. */
export const actorName = (req: any) => req?.user?.name || req?.user?.email || 'Someone';

/** "Linen shirt — M / Red", or the product's name for its only variant. */
export const itemName = (product: any, variant: any) => (variant?.isDefault || !variant?.title ? product?.name || 'Item' : `${product?.name || 'Item'} — ${variant.title}`);
