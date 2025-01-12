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
        fontFamily: font,
        images: [
          "https://images.squarespace-cdn.com/content/v1/60e4724ea746166606f95abb/57040601-5789-4824-ac9b-bca659c6342e/1+LiveBETA+Medtech+Spring+2018.jpg?format=1500w",
          "https://images.squarespace-cdn.com/content/v1/60e4724ea746166606f95abb/66d5240c-a1da-45e3-ab01-9839e3553300/edited+2.jpg?format=1500w",
          "https://images.squarespace-cdn.com/content/v1/60e4724ea746166606f95abb/ed9eeb87-9773-4ec0-8d0a-c0c3a704e89c/Toronto_kickoff_2019_2_edited.jpg?format=1500w",
          "https://images.squarespace-cdn.com/content/v1/60e4724ea746166606f95abb/09adb33b-bea3-421c-98d4-955c06212d29/gBETA-15.jpg?format=1500w",
        ],
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
