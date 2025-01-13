import { Settings } from "../../imports.js";
import mongoose, { get, Schema } from "mongoose";
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
        btnFontSize: getNumber(16),
        btnFontWeight: getNumber(600),
        btnHoverBg: colors?.fg,
        btnHoverFg: colors?.bg,
      },
      banner: {
        children: getString("We accelerate entrepreneurs."),
        images: [""],
        fontSizeBase: getNumber(16),
        fontSizeBg: getNumber(64),
        fontWeight: getNumber(700),
        paddingY: getNumber(2),
        paddingX: getNumber(6),
        bgColor: getString("#171923"),
        fgColor: getString("#f5f5f5"),
        primaryBtnTxt: getString("Explore Our Accelerators"),
        primaryBtnBg: getString("#8f5fff"),
        primaryBtnFg: getString("#fff"),
        btnHoverBg: getString("#6a47bd"),
        secondaryBtnTxt: getString("Get in Touch"),
        secondaryBtnBg: getString("#171923"),
        secondaryBtnFg: getString("#fff"),
        secondaryBtnHoverBg: getString("#6a47bd"),
        hide: getBoolean(true),
      },
      metricsContent: [
        {
          title: getString("Enter Title"),
          stats: getString("Enter Statistics"),
        },
      ],
      metricsCss: {
        metricsBg: getString("#fff"),
        titleFontSize: getNumber(13),
        titleFontWeight: getNumber(500),
        titleColor: getString("#000"),
        statsFontSizeBase: getNumber(24),
        statsFontSizeBg: getNumber(48),
        statsFontWeight: getNumber(600),
        statsColor: getString("#8f5fff"),
        hide: getBoolean(true),
      },
      servicesCss: {
        bgColor: getString("#f5f5f4"),
        titleColor: getString("#6a52fe"),
        descriptionColor: getString("#000"),
        titleSize: getNumber(22),
        descriptionSize: getNumber(16),
        shadow: String,
        boxShadow: { type: String, default: "0 1px 1px rgba(0, 0, 0, 0.1)" },
        showDivider: getBoolean(true),
        dividerColor: getString('#e4e2e2'),
        hide: getBoolean(false),
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
