import adminProtect from '../protect.admin.middleware.js';

/**
 * The deactivation gate, exercised through the real middleware.
 *
 * Admin tokens are signed without `expiresIn`, so this check is the only thing
 * that ever stops one working. A regression here is silent: every route keeps
 * answering 200 for someone whose access was revoked.
 */
jest.mock('../../../imports.js', () => ({
	Admin: { findById: jest.fn() },
}));

jest.mock('jsonwebtoken', () => ({
	verify: jest.fn(() => ({ _id: 'admin_1' })),
}));

const { Admin } = jest.requireMock('../../../imports.js');

/** `findById().select().populate()` — the chain the middleware actually calls. */
const respondWith = (admin: any) =>
	Admin.findById.mockReturnValue({
		select: () => ({ populate: async () => admin }),
	});

const runProtect = async (admin: any) => {
	respondWith(admin);

	const req: any = { headers: { authorization: 'Bearer token' } };
	const next = jest.fn();
	const res: any = {
		statusCode: 0,
		body: null,
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json(payload: any) {
			this.body = payload;
			return this;
		},
	};

	await adminProtect(req, res, next);

	return { req, res, next };
};

describe('adminProtect', () => {
	beforeEach(() => jest.clearAllMocks());

	it('lets an active admin through', async () => {
		const { next, req } = await runProtect({
			_id: 'admin_1',
			isActive: true,
			role: { permissions: ['view-vercel'] },
		});

		expect(next).toHaveBeenCalled();
		expect(req.permissions).toEqual(['view-vercel']);
	});

	it('rejects a deactivated admin even with a valid token', async () => {
		const { next, res } = await runProtect({
			_id: 'admin_1',
			isActive: false,
			role: { permissions: ['delete-vercel'] },
		});

		expect(next).not.toHaveBeenCalled();
		expect(res.statusCode).toBe(401);
		expect(res.body.message).toMatch(/deactivated/i);
	});

	it('rejects a soft-deleted admin', async () => {
		const { next, res } = await runProtect({
			_id: 'admin_1',
			isActive: true,
			isDeleted: true,
			role: { permissions: [] },
		});

		expect(next).not.toHaveBeenCalled();
		expect(res.statusCode).toBe(401);
	});

	it('rejects a token whose admin no longer exists', async () => {
		const { next, res } = await runProtect(null);

		expect(next).not.toHaveBeenCalled();
		expect(res.statusCode).toBe(401);
	});

	it('does not require isActive to be present on legacy records', async () => {
		// Older rows predate the field. `default: true` covers new ones, but an
		// undefined value must read as active rather than locking people out.
		const { next } = await runProtect({ _id: 'admin_1', role: { permissions: [] } });

		expect(next).toHaveBeenCalled();
	});
});
