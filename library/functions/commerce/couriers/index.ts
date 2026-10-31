import { CourierAdapter } from './types.js';
import { steadfast } from './steadfast.js';
import { pathao } from './pathao.js';
import { redx } from './redx.js';

/**
 * The courier registry (docs/couriers CR5): one adapter per courier. Adding a
 * courier = its adapter file and a line here. Each store connects its own
 * account with each (CR18).
 */
export const ADAPTERS: Record<string, CourierAdapter> = { steadfast, pathao, redx };

export const adapterOf = (id: string): CourierAdapter | null => ADAPTERS[id] || null;

/** What the store wizard offers by country (Store settings → Delivery). */
export const COURIERS: Record<string, { name: string; countries: string[]; ready: boolean }> = Object.fromEntries(
	Object.values(ADAPTERS).map(a => [a.id, { name: a.name, countries: a.countries, ready: a.ready }])
);
