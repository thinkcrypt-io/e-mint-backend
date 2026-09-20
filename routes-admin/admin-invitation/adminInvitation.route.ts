import express from 'express';
import {
	inviteAdminController,
	resendInvitationController,
	cancelInvitationController,
	getInvitationInfoController,
	acceptInvitationController,
} from './controllers/index.js';
import { adminProtect as protect, adminPermissions as hasPermission } from '../../imports.js';

const router = express.Router();

// Authenticated: managing invitations from the admin panel. Resend/cancel are
// PUT (not POST) so the admins table's generic "update-api" row-action menu
// item (useUpdateByIdMutation, which always PUTs `${path}/${id}`) can drive
// them by passing `${admin._id}/resend` / `${admin._id}/cancel` as the `id`.
router.post('/invite', protect, hasPermission(['create-admin-invitation']), inviteAdminController);
router.put(
	'/:id/resend',
	protect,
	hasPermission(['edit-admin-invitation']),
	resendInvitationController
);
router.put(
	'/:id/cancel',
	protect,
	hasPermission(['delete-admin-invitation']),
	cancelInvitationController
);

// Public: the invitee isn't logged in yet.
router.get('/:token', getInvitationInfoController);
router.post('/:token/accept', acceptInvitationController);

export default router;
