import { colors, getNumber, getString } from '../index.js';

type FlexSchemaProps = {
	height?: {
		base?: string;
		md?: string;
	};
	width?: {
		base?: string;
		md?: string;
	};
  bg?: string;
  color?: string;
	direction?: {
		base?: string;
		md?: string;
	};
	wrap?: {
		base?: string;
		md?: string;
	};
	justifyContent?: {
		base?: string;
		md?: string;
	};
	alignItems?: {
		base?: string;
		md?: string;
	};
	gap?: {
		base?: number;
		md?: number;
	};
	flex?: number;
	paddingX?: {
		base: number;
		md: number;
	};
	paddingY?: {
		base: number;
		md: number;
	}
};

const FlexSchema = ({
	height = { base: '0', md: '0' },
	width = { base: '0', md: '0' },
  bg,
	color,
	direction = { base: 'row', md: 'row' },
	wrap = { base: 'nowrap', md: 'nowrap' },
	justifyContent = { base: 'flex-start', md: 'flex-start' },
	alignItems = { base: 'flex-start', md: 'flex-start' },
	gap = { base: 0, md: 0 },
	flex,
	paddingX = { base: 0, md: 0 },
	paddingY = { base: 0, md: 0 },
}: FlexSchemaProps): any => {
	return {
		height: {
			base: getString(height?.base || '0'),
			md: getString(height?.md || '0'),
		},
		width: {
			base: getString(width?.base || '0'),
			md: getString(width?.md || '0'),
		},
		bg: bg ? getString(bg) : colors?.bg,
		color: color ? getString(color) : colors?.fg,
		direction: {
			base: getString(direction?.base || 'row'),
			md: getString(direction?.md || 'row'),
		},
		wrap: {
			base: getString(wrap?.base || 'nowrap'),
			md: getString(wrap?.md || 'nowrap'),
		},
		justifyContent: {
			base: getString(justifyContent?.base || 'flex-start'),
			md: getString(justifyContent?.md || 'flex-start'),
		},
		alignItems: {
			base: getString(alignItems?.base || 'flex-start'),
			md: getString(alignItems?.md || 'flex-start'),
		},
		gap: {
			base: getNumber(gap?.base || 0),
			md: getNumber(gap?.md || 0),
		},
		flex: getNumber(flex || 1),
		paddingX: {
			base: getNumber(paddingX?.base || 0),
			md: getNumber(paddingX?.md || 0),
		},
		paddingY: {
			base: getNumber(paddingY?.base || 0),
			md: getNumber(paddingY?.md || 0),
		},
	};
};

export default FlexSchema;
