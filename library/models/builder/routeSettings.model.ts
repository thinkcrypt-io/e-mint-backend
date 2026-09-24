import mongoose from 'mongoose';
import { draftableSchema } from './draftable.js';

/**
 * The DB copy of a route's settings file (`<model>/settings.ts`).
 *
 * `data.fields` is an ordered array of `{ key, ...fieldSettings }` rather than
 * an object keyed by field: order is meaningful (it's the schema order the
 * admin renders), and several settings keys contain dots ('options.create',
 * 'bank.accountName'), which don't survive as Mongo object keys.
 *
 * Published settings drive the admin API itself — validation, which fields
 * are editable, sortable and searchable, what's populated or excluded — so
 * publishing one changes backend behaviour, not just what's displayed.
 * Filters are not here: they live in RouteConfig.filters.
 */
const schema = draftableSchema();

export default mongoose.model<any>('RouteSettings', schema, 'routesettings');
