import { getNumber, getString, font, colors } from '../index.js';

type ButtonSchemaProps = {
	fontSize?: number;
	fontWeight?: string;
	letterSpacing?: number;
	px?: number;
	py?: number;
	size?: 'lg' | 'md' | 'sm' | 'xs';
	borderRadius?: number;
	bg?: string;
	color?: string;
	borderColor?: string;
	children?: string;
	_hover?: {
		bg?: string;
		color?: string;
		borderColor?: string;
	};
	mx?: number;
	my?: number;
	variant?: 'solid' | 'outline' | 'ghost' | 'link';
	borderWidth?: number;
	fontFamily?: string;
};

const defaultPropsValues: ButtonSchemaProps = {
	fontSize: 16,
	fontWeight: '400',
	letterSpacing: 0.2,
	children: 'Button',
	fontFamily: 'Roboto',
	px: 4,
	py: 4,
	mx: 0,
	my: 0,
	variant: 'solid',
	borderRadius: 4,
	bg: '#333',
	color: '#fff',
	borderColor: '#333',
	borderWidth: 1,
	size: 'md',
	_hover: {
		bg: '#fff',
		color: '#333',
		borderColor: '#333',
	},
};

const ButtonSchema = (defaultProps = defaultPropsValues): any => {
	return {
		fontSize: getNumber(defaultProps?.fontSize || 16),
		fontWeight: getString(defaultProps?.fontWeight || '400'),
		color: getString(defaultProps?.color || '#fff'),
		bg: getString(defaultProps?.bg || '#333'),
		letterSpacing: getNumber(defaultProps?.letterSpacing || 0),
		px: getNumber(defaultProps?.px || 0),
		py: getNumber(defaultProps?.py || 0),
		mx: getNumber(defaultProps?.mx || 0),
		my: getNumber(defaultProps?.my || 0),
		size: getString(defaultProps?.size || 'md'),
		borderColor: getString(defaultProps?.borderColor || '#333'),
		fontFamily: getString(defaultProps?.fontFamily || 'Roboto'),
		_hover: {
			bg: getString(defaultProps?._hover?.bg || '#fff'),
			color: getString(defaultProps?._hover?.color || '#333'),
			borderColor: getString(defaultProps?._hover?.borderColor || '#333'),
		},
		variant: getString(defaultProps?.variant || 'solid'),
		borderRadius: getNumber(defaultProps?.borderRadius || 4),
		children: getString(defaultProps?.children || 'Button'),
		borderWidth: getNumber(defaultProps?.borderWidth || 1),
	};
};

export default ButtonSchema;
