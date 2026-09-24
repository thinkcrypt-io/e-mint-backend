// One implementation for every API: the admin routes resolve their filters
// from FilterConfig documents first, and that lookup lives in the library copy.
export { default } from '../../library/controllers/queryhelper/getFilters.controller.js';
