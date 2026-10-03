import { Schema } from 'mongoose';

/**
 * A built model's Password fields (kind `password`): a credential kept for
 * someone — a client's portal login, a Wi-Fi key. Stored and returned as
 * text; the panel shows it as dots with show and copy. The path carries
 * `secret: true` so history records that it changed, never the value.
 */

/** The model's Password paths. */
export const secretPaths = (schema: Schema): string[] =>
	Object.keys((schema as any).paths).filter(p => (schema as any).paths[p]?.options?.secret);
