export { default as active } from './active.middleware.js';
export { default as isActive } from './active.middleware.js';

export {
	protect,
	self,
	self as isSelf,
	superAdmin,
	superAdmin as isSuperAdmin,
	admin,
	admin as isAdmin,
	softProtect,
} from './auth.middleware.js';

export { default as filter } from './filter.middleware.js';
export { default as query } from './filter.middleware.js';

export { default as ifExists } from './isExists.middleware.js';
export { default as isExists } from './isExists.middleware.js';
export { default as doesExist } from './isExists.middleware.js';
export { default as duplicateEntry } from './isExists.middleware.js';

export { default as existCondition } from './existCondition.middleware.js';

export { default as myData } from './myData.middleware.js';
export { default as pagination } from './pagination.middleware.js';
export { default as paginate } from './pagination.middleware.js';
export { default as sort } from './pagination.middleware.js';

export { default as validate } from './validate.middleware.js';
export { default as ifExistOnUpdate } from './ifExistOnUpdate.middleware.js';
export { default as hasPermission } from './hasPermission.middleware.js';

export { default as customQuery } from './customQuery.middleware.js';
// export { default as myData } from './myData.middleware.js';
export { protect as userProtect } from './userAuth.middleware.js';
export { default as extendRequestBody } from './extendRequestBody.middleware.js';
export { default as isExpired } from './isExpired.middleware.js';
export { default as packageExpired } from './isExpired.middleware.js';

export { default as isDeletePossible } from './isDeletePossible.middleware.js';
export { default as isDeleteAllowed } from './isDeletePossible.middleware.js';

export { default as notAllowed } from './notAllowed.middleware.js';

export * from './admin/index.js';
