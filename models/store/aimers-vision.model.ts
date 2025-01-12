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

const schema = new Schema<any>(
  {
    basic: {
      name: getString("Aimers Vision", true),
      logo: getString(""),
      phone: getString("+8801775474284"),
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
        align: getString("center"),
        btnBg: colors?.fg,
        btnFg: colors?.bg,
        btnRadius: getNumber(4),
        btnText: getString("APPLY"),
        btnWidth: getNumber(200),
        btnHeight: getNumber(10),
        btnFontSize: getNumber(16),
        btnFontWeight: getNumber(600),
        btnHoverBg: colors?.fg,
        btnHoverFg: colors?.bg,
      },
      banner: {
        children: getString("Enter your text here"),
        fontFamily: font,
        height: getNumber(50),
        fontSize: getNumber(16),
        letterSpacing: getNumber(0),
        paddingY: getNumber(8),
        paddingX: getNumber(16),
        fontWeight: getNumber(400),
        bgColor: getString("#333333"),
        fgColor: getString("#f5f5f5"),
        hide: getBoolean(true),
        textAlign: getString("center"),
      },
    },
    isActive: { type: Boolean, required: true, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true }, // Include this line to ensure virtuals are included when converting to JSON
    toObject: { virtuals: true }, // Include this line to ensure virtuals are included when converting to objects
  }
);

export const contentSettings: Settings = {
  basic: {
    type: "array-object",
    title: "Basic",
    edit: true,
  },

  content: {
    type: "array-object",
    title: "Content",
    edit: true,
  },
  isActive: {
    type: "boolean",
    title: "Is Active",
    edit: true,
  },
  shop: {
    type: "string",
    title: "Shop",
    edit: true,
  },
  socials: {
    type: "object",
    title: "Socials",
    edit: true,
  },
};

const AimersVision = mongoose.model<any>("AimersVision", schema);
export default AimersVision;
