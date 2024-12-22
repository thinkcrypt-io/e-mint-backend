const PLACEHOLDER_ICON =
	'https://images.pexels.com/photos/28216688/pexels-photo-28216688/free-photo-of-autumn-camping.png?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2';

export const font = {
	type: String,
	default: 'Roboto',
};

export const getFontSize = (size?: number) => {
	return {
		type: Number,
		default: size || 16,
	};
};

export const getBoolean = (bol: boolean) => {
	return {
		type: Boolean,
		default: bol,
	};
};

export const getNumber = (num: number) => {
	return {
		type: Number,
		default: num,
	};
};

export const getResponsiveFontSize = (lg: number, sm: number) => {
	return {
		sm: {
			type: Number,
			default: sm || 16,
		},
		lg: {
			type: Number,
			default: lg || 16,
		},
	};
};

export const getString = (str: string, required?: boolean) => {
	return {
		type: String,
		default: str,
		required: required || false,
	};
};

export const getImage = (str?: string, required?: boolean) => {
	return {
		type: String,
		default: str || PLACEHOLDER_ICON,
		required: required || false,
	};
};

export const colors = {
	fg: {
		type: String,
		default: '#353535',
	},
	bg: {
		type: String,
		default: '#e5e5e5',
	},
};
