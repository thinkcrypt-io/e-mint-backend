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

// Authenticated: managing invitations from the admin panel.
// Resend is PUT so the admins table's generic "update-api" row-action menu
// item (useUpdateByIdMutation, which always PUTs `${path}/${id}`) can drive
// it by passing `${admin._id}/resend` as the `id`.
// Cancel is DELETE so the table's "delete" row-action (the same confirmation
// UI as every other delete, useDeleteByIdMutation, which always DELETEs
// `${path}/${id}`) can drive it the same way with `${admin._id}/cancel`.
router.post('/invite', protect, hasPermission(['create-admin-invitation']), inviteAdminController);
router.put(
	'/:id/resend',
	protect,
	hasPermission(['edit-admin-invitation']),
	resendInvitationController
);
router.delete(
	'/:id/cancel',
	protect,
	hasPermission(['delete-admin-invitation']),
	cancelInvitationController
);

// Public: the invitee isn't logged in yet.
router.get('/:token', getInvitationInfoController);
router.post('/:token/accept', acceptInvitationController);

export default router;
