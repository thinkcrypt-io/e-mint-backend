import { Response } from "express";
import Order from "../../models/order/order.model.js";
import Product from "../../models/products/products.model.js";
import sendMail from "../mail/sendMail.controller.js";
import sendSMS from "../util/sendSms.controller.js";
import { Shop } from "../../imports.js";
import { v4 as uuidv4 } from "uuid";
import SSLCommerzPayment from "sslcommerz-lts";
import mongoose from "mongoose";

// Create a schema for pending payments
const pendingPaymentSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true },
  orderData: { type: Object, required: true },
  items: { type: Array, required: true },
  createdAt: { type: Date, default: Date.now, expires: "24h" }, // Auto-expire after 24 hours
});

// Create model if it doesn't exist (prevents re-declaration error)
const PendingPayment =
  mongoose.models.PendingPayment ||
  mongoose.model("PendingPayment", pendingPaymentSchema);

const addUserOrder = async (req: any, res: Response) => {
  const {
    cart,
    isPaid,
    address,
    paymentMethod,
    paymentAmount,
    paidAmount,
    status,
    note,
  } = req.body;

	// console.log('check cart', cart);
	// return res.json(req.body);
	

	// console.log('check cart', cart);
	// return res.json(req.body);
	

	try {
		// Generate a unique transaction ID
		const transactionId = uuidv4();

    // Create base order data object
    const orderData = {
      user: req.user._id,
      items: cart.items,
      total: cart.total,
      vat: cart.vat,
      subTotal: cart.subTotal,
      coupon: cart.couponId,
      address,
      origin: "website",
      paymentMethod,
      customer: req.user._id,
      orderDate: Date.now(),
      paymentAmount,
      note,
      paidAmount,
      shippingCharge: cart.shipping,
      discount: cart.discount,
      shop: req.shop,
      trnxRef: transactionId,
    };

    const findShop: any = await Shop.findById(req.shop);

    // Handle different payment methods
    if (paymentMethod === "cash on delivery") {
      // For COD, create order immediately with isPaid=false
      const codOrderData = {
        ...orderData,
        isPaid: false,
        status: status || "pending",
        dueAmount: Number(cart?.total) - Number(paymentAmount || 0),
      };

      const order = new Order(codOrderData);
      const saved = (await order.save()) as any;

      // Send notifications
      await sendOrderNotifications(
        req.user.email,
        address?.phone,
        saved._id,
				saved.invoice,
        saved.total,
        findShop?.name
      );

      // Reduce stock of items
      await reduceProductStock(cart.items);

      return res.status(201).json({
        message: `Order id: ${saved._id} added successfully`,
        order: saved,
      });
    } else if (paymentMethod === "sslcommerz") {
      // For SSL, store order data temporarily without creating actual order
      // and without reducing stock yet
      //
      // Initialize SSLCommerz payment
      const store_id = process.env.STORE_ID;
      const store_passwd = process.env.STORE_PASS;
      const is_live = false; // true for live, false for sandbox

      // Prepare data for SSLCommerz
      const sslData = {
        total_amount: cart.total,
        currency: "BDT",
        tran_id: transactionId,
        success_url: `${process.env.API_URL}/user-api/orders/success/${transactionId}`,
        fail_url: `${process.env.API_URL}/user-api/orders/fail/${transactionId}`,
        cancel_url: `${process.env.API_URL}/user-api/orders/cancel/${transactionId}`,
        ipn_url: `${process.env.API_URL}/user-api/orders/ipn/${transactionId}`,
        shipping_method: "Courier",
        product_name:
          cart.items
            .map((item: any) => item.title)
            .join(", ")
            .substring(0, 50) || "Product",
        product_category: "Mixed",
        product_profile: "general",
        cus_name: address.name || "Customer",
        cus_email: address.email || req.user.email,
        cus_add1: address.address || "Address",
        cus_add2: "",
        cus_city: "",
        cus_state: "",
        cus_postcode: "",
        cus_country: "Bangladesh",
        cus_phone: address.phone || "",
        cus_fax: "",
        ship_name: address.name || "Customer",
        ship_add1: address.address || "Address",
        ship_add2: "",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: "1220",
        ship_country: "Bangladesh",
      };

      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);

      // Store order data in pending payments collection
      const completeOrderData = {
        ...orderData,
        isPaid: true, // Will be true when payment succeeds
        status: "processing", // Status for paid orders
        dueAmount: 0, // Fully paid
      };

      await PendingPayment.create({
        transactionId,
        orderData: completeOrderData,
        items: cart.items,
      });

			const savePayment = await PendingPayment.create({
				transactionId,
				orderData: completeOrderData,
				items: cart.items,
			});

			// return res.json(savePayment);

			// Initialize SSLCommerz payment
			const apiResponse = await sslcz.init(sslData);
			const redirectUrl = apiResponse?.GatewayPageURL;

      return res.status(200).json({
        url: redirectUrl,
        transactionId: transactionId,
      });
    } else {
      return res.status(400).json({
        message: "Invalid payment method",
      });
    }
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

// Helper function to send order notifications
const sendOrderNotifications = async (
  email: string,
  phone: string,
  orderId: string | any,
	invoiceId: string | any,
  total: number,
  shopName: string
) => {
	// Send email notification
	sendMail({
		title: shopName || 'Shop',
		to: email,
		subject: 'Order Placed',
		body: `Thank you for shopping at ${shopName}. Your order has been placed successfully. Order id: ${invoiceId}, Total: ${total}. Download your invoice from here: ${process.env.WEBSITE}/my-purchase/${orderId}/invoice`,
	});

	// Send SMS notification if phone number is available
	if (phone) {
		sendSMS({
			receiver: phone,
			message: `Thank you for shopping at ${shopName}. Invoice: ${invoiceId}, Tk. ${total}. Details: ${process.env.WEBSITE}/my-purchase/${orderId}/invoice. Shop Online: ${process.env.WEBSITE}`,
		});
	}
};

const reduceProductStock = async (items: any[]) => {
  for (const item of items) {
    try {
      // Find the product
      const product = await Product.findById(item._id);

      if (!product) {
        console.error(`Product not found: ${item._id}`);
        continue;
      }

      // Find the specific variant
      const variantIndex = product.variations.findIndex(
        (variant: any) => variant._id.toString() === item.variantId
      );

      if (variantIndex === -1) {
        console.error(
          `Variant not found for product ${item._id}: ${item.variantId}`
        );
        continue;
      }

      // Reduce stock for the specific variant
      product.variations[variantIndex].stock -= item.qty;

      product.stock = product.variations.reduce(
        (total: number, variant: any) => total + variant.stock,
        0
      );

      // Save the updated product
      await product.save();
    } catch (error) {
      console.error(`Error reducing variant stock: ${error}`);
      throw error;
    }
  }
};

// Export functions for use in routes
export { PendingPayment, reduceProductStock, sendOrderNotifications };

export default addUserOrder;
