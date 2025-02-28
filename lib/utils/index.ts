export { default as filters } from './filters/filters.js';

export const REGEX = {
	URL: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
	EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
	PHONE_BD: /^(\+8801|01)[1-9]\d{8}$/,
};
