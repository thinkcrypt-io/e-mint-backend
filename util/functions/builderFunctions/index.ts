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
