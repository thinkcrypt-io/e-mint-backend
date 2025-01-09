import { Settings } from "../../imports.js";
import mongoose, { Schema } from "mongoose";
import {
  getString,
  colors,
  getNumber,
  font,
  getBoolean,
  getImage,
} from "../../util/index.js";

const schema = new Schema<any>({
  basic: {
    name: getString("Aimers Vision", true),
    logo: getString(""),
    phone: getString("+8801xxxxxxxxx"),
    email: getString("example@yourmail.com"),
    address: getString("Dhaka, Bangladesh"),
    bgColor: colors?.bg,
    cardBg: colors?.bg,
    btnColor: colors?.fg,
    btnTextColor: colors?.bg,
    primaryFont: font,
    secondaryFont: font,
    brandColor: colors?.bg,
    brandTextColor: colors?.fg,
    primaryTextColor: colors?.bg,
    secondaryTextColor: colors?.bg,
    paddingXBase: getNumber(16),
    paddingXBG: getNumber(128),
    maxWidth: getNumber(1200),
  },
  shop: {
    type: Schema.Types.ObjectId,
    ref: "Shop",
    required: true,
  },

  socials: {
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String,
    pinterest: String,
    youtube: String,
    vimeo: String,
  },

  content: {
    header: {
      logo: getString(""),
      logoHeight: getNumber(50),
      logoWidth: getNumber(50),
      align: getString(""),
      btnBg: colors?.fg,
      btnFg: colors?.bg,
      btnRadius: getNumber(4),
      btnText: getString("Search"),
      btnWidth: getNumber(100),
      btnHeight: getNumber(44),
      btnFontSize: getNumber(16),
      btnFontWeight: getNumber(600),
      btnHoverBg: colors?.fg,
      btnHoverFg: colors?.bg,
    },
    banner: {},
  },
});
