import { CourierAdapter } from './types.js';
import { steadfast } from './steadfast.js';
import { pathao } from './pathao.js';
import { redx } from './redx.js';
import { manual } from './manual.js';
import { paperfly } from './paperfly.js';
import { carrybee } from './carrybee.js';

/**
 * The courier registry (docs/couriers CR5): one adapter per courier. Adding a
 * courier = its adapter file and a line here. Each store connects its own
 * account with each (CR18).
 */
export const ADAPTERS: Record<string, CourierAdapter> = { steadfast, pathao, redx, manual, paperfly, carrybee };

export const adapterOf = (id: string): CourierAdapter | null => ADAPTERS[id] || null;

/** What the store wizard offers by country (Store settings → Delivery): couriers that can carry parcels. */
export const COURIERS: Record<string, { name: string; countries: string[]; ready: boolean }> = Object.fromEntries(
	Object.values(ADAPTERS)
		.filter(a => !a.checksOnly)
		.map(a => [a.id, { name: a.name, countries: a.countries, ready: a.ready }])
);

/** Couriers a store can only check buyers with (CR-26) — offered in Delivery settings beside the others, never for parcels. */
export const CHECK_ONLY = Object.values(ADAPTERS).filter(a => a.checksOnly);
