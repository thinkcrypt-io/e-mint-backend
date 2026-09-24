import { Schema } from 'mongoose';
import Notification from '../models/notifications/notification.model.js';
import Admin from '../models/admin/model.js';

/**
 * Notifications, and the one kind sent today: "you were given access to a
 * record". `accessNotifications` is a schema plugin for access-restricted
 * models (recordAccess.function.ts): after a save, everyone who can now see a
 * private record and couldn't before is told, with a link to its view page.
 *
 * Only the owner can change a record's access (the middleware enforces it),
 * so the owner is the one who gave it.
 */

type NotificationInput = {
	recipient: any;
	actor?: any;
	type: string;
	title: string;
	message?: string;
	href?: string;
	route?: string;
	record?: any;
};

/** Stores notifications; never throws — a failed notification must not fail the save it follows. */
export const notify = async (items: NotificationInput[]) => {
	if (!items.length) return;
	try {
		await Notification.insertMany(items, { ordered: false });
	} catch (e: any) {
		console.error('notify:', e?.message);
	}
};

type AccessOptions = {
	/** The admin route the records live under — their view page is /view/<route>/<id>. */
	route: string;
	/** What one record is called, e.g. "Invoice". */
	noun: string;
	/** The field that names a record. */
	displayField?: string;
};

const ids = (list: any) => (Array.isArray(list) ? list.map((x: any) => String(x?._id || x)).filter(Boolean) : []);

/** Who could see the record, by id — beyond its owner and "everyone" when public. */
const grantees = (privacy: string, access: any) => (privacy === 'private' ? ids(access) : []);

export const accessNotifications = (schema: Schema, { route, noun, displayField }: AccessOptions) => {
	schema.post('init', function (this: any) {
		this.$locals.accessBefore = grantees(this.privacy, this.access);
	});

	schema.pre('save', function (this: any) {
		this.$locals.accessChanged = this.isNew || this.isModified('access') || this.isModified('privacy');
		if (this.isNew) this.$locals.accessBefore = [];
	});

	schema.post('save', function (this: any) {
		if (!this.$locals.accessChanged) return;
		const before = new Set<string>(this.$locals.accessBefore || []);
		const owner = this.addedBy ? String(this.addedBy?._id || this.addedBy) : '';
		const fresh = [...new Set(grantees(this.privacy, this.access))].filter(id => !before.has(id) && id !== owner);
		this.$locals.accessBefore = grantees(this.privacy, this.access);
		if (!fresh.length) return;

		const doc = this;
		// After the response is on its way: the save doesn't wait on it.
		setImmediate(async () => {
			const actor: any = owner ? await Admin.findById(owner).select('name').lean().catch(() => null) : null;
			const name = displayField && doc.get?.(displayField);
			const label = typeof name === 'string' && name.trim() ? `${noun} “${name.trim()}”` : noun.toLowerCase();
			await notify(
				fresh.map(recipient => ({
					recipient,
					actor: owner || undefined,
					type: 'access-granted',
					title: `${actor?.name || 'Someone'} gave you access to ${label}`,
					message: doc.code ? `${noun} ${doc.code}` : undefined,
					href: `/view/${route}/${doc._id}`,
					route,
					record: doc._id,
				}))
			);
		});
	});
};
