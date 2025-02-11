import { getNumber, getString } from '../index.js';

type ImageSchemaProps = {
	width: string;
	height?: string;
	objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
	borderRadius?: number;
	borderWidth?: number;
	borderColor?: string;
	boxShadow?: string;
	opacity?: number;
	mx?: number;
	my?: number;
	px?: number;
	py?: number;
	display?: 'block' | 'inline-block' | 'flex' | 'none';
	src: string;
	href?: string;
	alt?: string;
};

const ImageSchema = ({
	width = 'auto',
	height = 'auto',
	objectFit = 'cover',
	borderRadius = 0,
	borderWidth = 0,
	borderColor,
	boxShadow,
	opacity = 1,
	mx = 0,
	my = 0,
	px = 0,
	py = 0,
	display = 'block',
	src = '',
	alt = '',
}: ImageSchemaProps): any => {
	return {
		width: {
			base: getString(width),
			md: getString(width),
		},

		alt: getString(alt),

		src: {
			base: getString(src),
			md: getString(src),
		},
		height: {
			base: getString(height),
			md: getString(height),
		},
		objectFit: getString(objectFit),
		borderRadius: getNumber(borderRadius),
		borderWidth: getNumber(borderWidth),
		// borderColor: getString(borderColor),
		//boxShadow: boxShadow ? getString(boxShadow) : 'none',
		opacity: getNumber(opacity),
		mx: getNumber(mx),
		my: getNumber(my),
		px: getNumber(px),
		py: getNumber(py),
		display: getString(display),
	};
};

export default ImageSchema;
