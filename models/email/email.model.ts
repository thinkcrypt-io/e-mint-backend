import mongoose, { Schema } from "mongoose";
import EmailType from "./email.types";

const schema = new Schema<EmailType>(
  {
    name: {
      type: "String",
      trim: true,
    },
    email: {
      type: "String",
      unique: true,
    },
    status: {
      type: "String",
    },
  },
  {
    timestamps: true,
  }
);

const Email = mongoose.model<EmailType>("Email", schema);
export default Email;