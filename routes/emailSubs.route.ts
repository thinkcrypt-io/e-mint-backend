import express from "express";
import {
  EmailSubscription as Model,
  EmailSubscriptionSettings as settings,
} from "../models/index.js";
import { checkEmailExists, commonRouter } from "../imports.js";

const router = express.Router();

router.use(
  "/",
  commonRouter({
    Model: Model,
    settings: settings,
    permission: "email-subscription",
    injectMiddleware: {
      post: [checkEmailExists({ Model })],
    },
  })
);
// if other endpoint comes after / , then it goes here
// like this --> /blog
export default router;
