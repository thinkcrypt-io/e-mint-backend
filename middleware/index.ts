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

export { default as myData } from './myData.middleware.js';
export { default as pagination } from './pagination.middleware.js';
export { default as paginate } from './pagination.middleware.js';
export { default as sort } from './pagination.middleware.js';

export { default as validate } from './validate.middleware.js';
export { default as ifExistOnUpdate } from './ifExistOnUpdate.middleware.js';
export { default as hasPermission } from './hasPermission.middleware.js';
