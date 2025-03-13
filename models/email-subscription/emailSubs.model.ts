import mongoose, { Schema } from "mongoose";

const emailSubscriptionSchema = new Schema<any>(
  {
    email: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const EmailSubscription = mongoose.model(
  "EmailSubscription",
  emailSubscriptionSchema
);
export default EmailSubscription;
export { default as settings } from "./emailSubs.settings.js";
