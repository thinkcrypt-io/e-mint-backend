import { getString, getNumber, colors } from '../index.js';

type TopBannerSchemaProps = {
	height?: string;
	width?: string;
	padding?: number;
	paddingVertical?: number;
	color?: string;
	bg?: string;
	justifyContent?: string;
	alignItems?: string;
};

const TopBannerSchema = ({
	height,
	width,
	padding,
	paddingVertical,
	color,
	bg,
	justifyContent,
	alignItems
}: TopBannerSchemaProps): any => {
	return {
		height: getString(height || '0'),
		width: getString(width || '0'),
		padding: getNumber(padding || 0),
		paddingVertical: getNumber(paddingVertical || 0),
		color: color ? getString(color) : colors?.fg,
		bg: bg ? getString(bg) : colors?.bg,
		justifyContent: getString(justifyContent || 'center'),
		alignItems: getString(alignItems || 'center'),
	};
};

export default TopBannerSchema;