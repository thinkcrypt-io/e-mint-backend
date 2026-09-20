import dotenv from 'dotenv';
import mongoose from 'mongoose';
import express from 'express';
import AdminInvoice from '../dist/models/payment/adminInvoice.model.js';

dotenv.config();
const app = express();

const connectDB = async () => {
	const uri = process.env.MONGO_CONNECTION_URI;

	try {
		const conn = await mongoose.connect(uri, {
			useUnifiedTopology: true,
			useNewUrlParser: true,
		});
		console.log(`Mongo DB connected: ${conn.connection.host}`);
	} catch (error) {
		console.log(`error: ${error.message}`);
		process.exit(1);
	}
};

connectDB();

// One-off backfill: existing invoices predate the `docType` field. The
// schema default handles reads either way, but filters/table columns need
// the field actually stored to match on it. Safe to run more than once —
// the $exists filter only ever matches rows still missing the field.
const migrateInvoiceDocType = async () => {
	try {
		const result = await AdminInvoice.updateMany(
			{ docType: { $exists: false } },
			{ $set: { docType: 'invoice' } }
		);
		console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		mongoose.connection.close();
		console.log('Connection closed');
		console.log('Exiting process with status code 0');
		process.exit(0);
	}
};

migrateInvoiceDocType();

app.listen(5000, () => {
	console.log(`Server running on port 5000`);
});
