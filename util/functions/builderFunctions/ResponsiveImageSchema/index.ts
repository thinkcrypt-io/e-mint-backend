import { getNumber, getString } from '../index.js';

type ResponsiveImageSchemaProps = {
  width: {
    base: string;
    md: string;
  };
  height?: {
    base: string;
    md: string;
  };
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
  src?: string;
  href?: string;
  alt?: string;
};

const ResponsiveImageSchema = ({
  width = {
    base: 'full',
    md: 'full',
  },
  height = {
    base: 'auto',
    md: 'auto',
  },
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
}: ResponsiveImageSchemaProps): any => {
  return {
    width: {
      base: getString(width?.base || '20px'),
      md: getString(width?.md || '40px'),
    },

    alt: getString(alt),

    src: {
      base: getString(src),
      md: getString(src),
    },
    height: {
      base: getString(height.base	|| '20px'),
      md: getString(height.base || '40px'),
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

export default ResponsiveImageSchema;
