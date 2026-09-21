import getSchema from '../getSchema.controller.js';
import convertToTableFields from '../../../functions/convertToTableFields.js';

/**
 * The `bold` column option, end to end.
 *
 * This is the path the table pages actually take: BackendPageTable calls
 * /get/schema and re-derives its columns client-side with convertToTableFields,
 * so a default added only to /get/config never reaches a cell. Both halves are
 * exercised here so that stays true.
 */

const runSchemaRoute = async (settings: any, query: any = {}) => {
	let payload: any;
	const res: any = {
		status: () => res,
		json: (body: any) => {
			payload = body;
			return res;
		},
	};
	await getSchema({ settings })({ query }, res);
	return payload;
};

const settings = {
	name: { title: 'Name', type: String },
	code: { title: 'Code', type: String },
	// A model opting its name column back out.
	nickname: { title: 'Nickname', type: String, schema: { bold: false } },
	// A model opting a non-name column in.
	total: { title: 'Total', type: Number, schema: { bold: true } },
};

describe('getSchema: bold', () => {
	it('marks name bold and leaves other columns alone', async () => {
		const schema = await runSchemaRoute(settings);

		expect(schema.name.bold).toBe(true);
		expect(schema.code.bold).toBe(false);
	});

	it('lets a settings file override the name default', async () => {
		const schema = await runSchemaRoute(settings);

		// The `...settings[key]?.schema` spread has to win over the default,
		// otherwise the documented opt-out is a no-op.
		expect(schema.nickname.bold).toBe(false);
		expect(schema.total.bold).toBe(true);
	});

	it('still answers ?type=keys without touching the schema branch', async () => {
		const payload = await runSchemaRoute(settings, { type: 'keys' });

		expect(payload.keys).toEqual(['name', 'code', 'nickname', 'total']);
	});
});

describe('convertToTableFields: bold', () => {
	it('carries bold through to the column, and only when true', async () => {
		const schema = await runSchemaRoute(settings);
		const columns = convertToTableFields({ schema, menu: false });
		const byKey = Object.fromEntries(columns.map((c: any) => [c.dataKey, c]));

		expect(byKey.name.bold).toBe(true);
		expect(byKey.total.bold).toBe(true);

		// Absent rather than `false` — TableRowComponent reads it as a boolean,
		// and an emitted `false` would be indistinguishable in behaviour but
		// noisier over the wire.
		expect(byKey.code).not.toHaveProperty('bold');
		expect(byKey.nickname).not.toHaveProperty('bold');
	});
});
