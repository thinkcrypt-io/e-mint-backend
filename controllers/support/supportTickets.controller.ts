import { Response } from 'express';
import mongoose from 'mongoose';
import SupportTicket, {
	TICKET_CATEGORIES,
	TICKET_PRIORITIES,
} from '../../models/support-tickets/supportTicket.model.js';
import Role from '../../library/models/admin-role/model.js';
import { notify } from '../../library/functions/notifications.function.js';

/**
 * The admin's Support page. Any signed-in admin can open a ticket and talk to
 * the support team in its thread, without the support-tickets permission the
 * team's table needs. The team — anyone with `edit-support-tickets` — can open
 * and answer every ticket's thread; everyone else only their own.
 */

const MAX_IMAGES = 10;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const imagesOf = (v: unknown) =>
	(Array.isArray(v) ? v : [])
		.filter((u: unknown) => typeof u === 'string' && /^(https?:\/\/|\/)/.test(u))
		.slice(0, MAX_IMAGES);

const THREAD_FIELDS = 'code name description category priority status images addedBy assignedTo replies replyCount lastReplyAt lastReplyBy createdAt updatedAt';
const LIST_FIELDS = 'code name description category priority status images replyCount lastReplyAt lastReplyBy createdAt updatedAt';

/** Whether the caller works tickets: may read and answer anyone's. */
const isSupportStaff = async (req: any) => {
	const role: any = await Role.findById(req.user?.role).select('permissions').lean();
	const permissions: string[] = role?.permissions || [];
	return permissions.includes('*') || permissions.includes('edit-support-tickets');
};

const sameId = (a: any, b: any) => !!a && !!b && String(a?._id || a) === String(b?._id || b);

/** The ticket, if the caller may see its thread; otherwise a response has been sent. */
const loadThread = async (req: any, res: Response) => {
	if (!mongoose.isValidObjectId(req.params.id)) {
		res.status(404).json({ message: 'Ticket not found.' });
		return null;
	}
	const ticket = await SupportTicket.findById(req.params.id).select(THREAD_FIELDS);
	if (!ticket) {
		res.status(404).json({ message: 'Ticket not found.' });
		return null;
	}
	const staff = await isSupportStaff(req);
	const owner = sameId(ticket.addedBy, req.user?._id);
	if (!owner && !staff) {
		// The same answer as a missing ticket: no hint that it exists.
		res.status(404).json({ message: 'Ticket not found.' });
		return null;
	}
	return { ticket, staff, owner };
};

const threadJson = async (ticket: any, staff: boolean, owner: boolean) => {
	await ticket.populate([
		{ path: 'addedBy', select: 'name' },
		{ path: 'assignedTo', select: 'name' },
		{ path: 'replies.author', select: 'name' },
	]);
	const doc = ticket.toObject();
	return { doc, viewer: { staff, owner } };
};

/** POST /admin/api/support-tickets/open — { name, description, category?, priority?, images? } */
export const openTicket = async (req: any, res: Response): Promise<Response> => {
	try {
		const name = text(req.body?.name, 200);
		const description = text(req.body?.description, 5000);
		if (!name) return res.status(400).json({ message: 'Add a subject.' });
		if (!description) return res.status(400).json({ message: 'Tell us what you need help with.' });

		const category = TICKET_CATEGORIES.includes(req.body?.category) ? req.body.category : 'question';
		// Urgent is the team's call; a requester can ask for up to high.
		const priority = ['low', 'normal', 'high'].includes(req.body?.priority) ? req.body.priority : 'normal';

		// Only these fields: a requester can't set the status, assignee or notes.
		const ticket = await SupportTicket.create({
			name,
			description,
			category,
			priority: TICKET_PRIORITIES.includes(priority) ? priority : 'normal',
			images: imagesOf(req.body?.images),
			status: 'open',
			addedBy: req.user?._id,
		});

		return res.status(201).json({ _id: ticket._id, code: ticket.code, status: ticket.status });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/** GET /admin/api/support-tickets/open/mine — the caller's own tickets, latest activity first. */
export const myTickets = async (req: any, res: Response): Promise<Response> => {
	try {
		const doc = await SupportTicket.find({ addedBy: req.user?._id })
			.select(LIST_FIELDS)
			.sort({ updatedAt: -1 })
			.limit(100)
			.lean();
		return res.status(200).json({ doc });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/** GET /admin/api/support-tickets/thread/:id — the ticket and its replies. */
export const getThread = async (req: any, res: Response): Promise<Response> => {
	try {
		const found = await loadThread(req, res);
		if (!found) return res;
		return res.status(200).json(await threadJson(found.ticket, found.staff, found.owner));
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/** POST /admin/api/support-tickets/thread/:id/reply — { message, images? } */
export const replyToThread = async (req: any, res: Response): Promise<Response> => {
	try {
		const found = await loadThread(req, res);
		if (!found) return res;
		const { ticket, staff, owner } = found;

		const message = text(req.body?.message, 5000);
		if (!message) return res.status(400).json({ message: 'Write a reply first.' });
		if (ticket.status === 'closed' && !staff)
			return res.status(400).json({ message: 'This ticket is closed. Open a new one if you still need help.' });

		// The team answering someone else's ticket; the requester answering their own.
		const asStaff = staff && !owner;
		ticket.replies.push({ author: req.user._id, message, images: imagesOf(req.body?.images), staff: asStaff });
		ticket.replyCount = ticket.replies.length;
		ticket.lastReplyAt = new Date();
		ticket.lastReplyBy = asStaff ? 'staff' : 'requester';
		// A team reply waits on the requester; their answer puts it back in the queue.
		if (asStaff && ['open', 'in-progress'].includes(ticket.status)) ticket.status = 'waiting';
		if (!asStaff && ['waiting', 'resolved'].includes(ticket.status)) ticket.status = 'open';
		await ticket.save();

		const href = `/support/${ticket._id}`;
		const recipient = asStaff ? ticket.addedBy : ticket.assignedTo;
		if (recipient && !sameId(recipient, req.user._id))
			notify([
				{
					recipient,
					actor: req.user._id,
					type: 'support-reply',
					title: asStaff ? `Support replied on ${ticket.code}` : `${ticket.code} has a new reply`,
					message: message.slice(0, 140),
					href,
					route: 'support-tickets',
					record: ticket._id,
				},
			]);

		return res.status(201).json(await threadJson(ticket, staff, owner));
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/**
 * POST /admin/api/support-tickets/thread/:id/status — { status }
 * The requester can close their ticket or reopen it; the team can set any status.
 */
export const setThreadStatus = async (req: any, res: Response): Promise<Response> => {
	try {
		const found = await loadThread(req, res);
		if (!found) return res;
		const { ticket, staff, owner } = found;
		const status = req.body?.status;

		const allowed = staff && !owner ? ['open', 'in-progress', 'waiting', 'resolved', 'closed'] : ['open', 'closed'];
		if (!allowed.includes(status)) return res.status(400).json({ message: 'That status can’t be set here.' });

		ticket.status = status;
		await ticket.save();

		if (staff && !owner && ticket.addedBy)
			notify([
				{
					recipient: ticket.addedBy,
					actor: req.user._id,
					type: 'support-status',
					title: `${ticket.code} is now ${status.replace('-', ' ')}`,
					href: `/support/${ticket._id}`,
					route: 'support-tickets',
					record: ticket._id,
				},
			]);

		return res.status(200).json(await threadJson(ticket, staff, owner));
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};
