import mongoose from 'mongoose';
import { draftableSchema } from './draftable.js';

/**
 * The DB copy of a route's config file (`<model>/config.ts`) — `fields`,
 * `table`, `form`, `route` (title, buttons, export, row menu `menu`, bulk
 * menu `select`) — plus the route's `filters`, which in code are spread across
 * the settings file's `filter` blocks.
 *
 * Every admin route with a filter row has one, including custom routes that
 * aren't built by defineRoutes; for those only `filters` is used.
 */
const schema = draftableSchema();

export default mongoose.model<any>('RouteConfig', schema, 'routeconfigs');
