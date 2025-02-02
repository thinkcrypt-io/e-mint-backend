import { getNumber, getString, font, colors } from '../index.js';

type TextSchemaProps = {
	fontSize?: {
		base?: number;
		md?: number;
	};
	fontWeight?: string;
	fontStyle?: 'normal' | 'italic';
	fontFamily?: string;
	letterSpacing?: number;
	lineHeight?: number;
	color?: string;
	textAlign?: 'left' | 'right' | 'center';
	pb?: number;
};

const TextSchema = ({
	fontSize = {
		base: 16,
		md: 16,
	},
	fontWeight,
	fontStyle = 'normal',
	fontFamily,
	color,
	letterSpacing,
	lineHeight,
	textAlign,
	pb,
}: TextSchemaProps): any => {
	return {
		fontSize: {
			base: getNumber(fontSize?.base || 16),
			md: getNumber(fontSize?.md || 16),
		},
		fontWeight: getString(fontWeight || '400'),
		textAlign: getString(textAlign || 'left'),
		color: color ? getString(color) : colors.fg,
		fontFamily: fontFamily ? getString(fontFamily) : getString(),
		letterSpacing: getNumber(letterSpacing || 0),
		lineHeight: getNumber(lineHeight || 1.2),
		pb: getNumber(pb || 0),
		fontStyle: {
			type: String,
			enum: ['normal', 'italic', 'oblique'],
			default: fontStyle || 'normal',
		},
	};
};

export default TextSchema;
