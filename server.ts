import express, { Application } from "express";
import dotenv from "dotenv";
import connectDb from "./db.js";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import requestIp from "request-ip";

//import routes
import {
  authRoute,
  categoryRoute,
  productRoute,
  customerRoute,
  orderRoute,
  permissionRoute,
  userRoute,
  uploadRoute,
  collectionRoute,
  contentRoute,
  feedbackRoute,
  scanRoute,
  qrRoute,
  roleRoute,
  restaurantRoute,
  itemRoute,
  expenseRoute,
  expenseCategoryRoute,
  brandRoute,
  adjustmentRoute,
  paymentRoute,
  invoiceRoute,
  returnRoute,
  deliveryRoute,
  ledgerRoute,
  supplierRoute,
  groupRoute,
  purchaseRoute,
  couponRoute,
  smsRoute,
  assetRoute,
  paymentAccountRoute,
  deploymentRoute,
  activeThemeRoute,
} from "./routes/index.js";

// import adminRouter from "./routes-admin/admin.router.js";
// import userRouter from "./user-routes/user.router.js";
// import appRouter from "./app-route/app.router.js";
// import adminRouter from './routes-admin/admin.router.js';
// import userRouter from './user-routes/user.router.js';
// import appRouter from './app-route/app.router.js';
import sellerApi from "./seller-api/sellerApi.js";
import staffApi from "./staff/router.js";

//User Routes

const app: Application = express();

dotenv.config();
app.use(helmet());

app.use(
  express.json({
    limit: "50mb",
  })
);

const allowedOrigins = [
  "http://localhost:3000",
  "http://example.com",
  "http://localhost:3001",
];

app.use(cors());
app.use(morgan("combined"));
app.use(requestIp.mw());

connectDb();

// Global error handler
process.on("unhandledRejection", (reason, promise) => {
  console.log("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});

app.use("/", (req, res, next) => {
  // console.log('Request URL:', `${req.method}: ${req.originalUrl}`);
  // console.log('Request Time:', Date.now());
  // console.log('Request IP:', req.ip);

  next();
  app.use("/", (req, res, next) => {
    next();
  });

  // app.use("/admin/api", adminRouter);
  // app.use("/user-api", userRouter);
  // app.use("/app-api/", appRouter);
  // app.use('/admin/api', adminRouter);
  // app.use('/user-api', userRouter);
  // app.use('/app-api/', appRouter);
  app.use("/api", sellerApi);
  app.use("/staff-api/", staffApi);

  //app.use('/api/orders', orderRoute);
  app.use("/api/auth", authRoute);
  app.use("/api/brands", brandRoute);
  app.use("/api/categories", categoryRoute);
  app.use("/api/contents", contentRoute);
  app.use("/api/adjustments", adjustmentRoute);
  app.use("/api/coupons", couponRoute);

  app.use("/api/items", itemRoute);
  app.use("/api/products", productRoute);
  app.use("/api/customers", customerRoute);
  app.use("/api/deliveries", deliveryRoute);

  app.use("/api/restaurant", restaurantRoute);
  app.use("/api/collections", collectionRoute);
  app.use("/api/orders", orderRoute);
  app.use("/api/roles", roleRoute);
  app.use("/api/permissions", permissionRoute);
  app.use("/api/users", userRoute);
  app.use("/api/payments", paymentRoute);

  app.use("/api/expenses", expenseRoute);
  app.use("/api/expense-categories", expenseCategoryRoute);

  app.use("/api/scans", scanRoute);
  app.use("/api/upload", uploadRoute);
  app.use("/api/feedbacks", feedbackRoute);
  app.use("/api/qr", qrRoute);
  app.use("/api/invoices", invoiceRoute);
  app.use("/api/returns", returnRoute);

  app.use("/api/ledgers", ledgerRoute);
  app.use("/api/suppliers", supplierRoute);
  app.use("/api/groups", groupRoute);
  app.use("/api/purchases", purchaseRoute);
  app.use("/api/sms", smsRoute);
  app.use("/api/assets", assetRoute);
  app.use("/api/payment-accounts", paymentAccountRoute);

  app.use("/api/deployments", deploymentRoute);
  app.use("/api/active-theme", activeThemeRoute);

  app.use((req, res, next) => {
    return res.status(404).json({
      error: "Not Found",
      message: "The requested resource could not be found",
    });
  });

  const port: string | number = process.env.PORT || 5000;

  app.listen(port, () => console.log(`Server running on Port: ${port}`));
});
