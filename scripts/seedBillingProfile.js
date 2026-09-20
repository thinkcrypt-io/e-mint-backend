import dotenv from 'dotenv';
import mongoose from 'mongoose';
import express from 'express';
import Content from '../dist/models/content/model.js';

dotenv.config();
const app = express();

const billingProfile = {
	company: {
		name: 'THINKCRYPT',
		addressLines: ['5B, House 88, Road 17/A,', 'Block E, Banani,', 'Dhaka 1213, Bangladesh'],
		phone: '01828398225',
		email: 'thinkcrypt@gmail.com',
		website: 'https://thinkcrypt.dev',
	},
	logoPath: 'public/brand/logo-badge.png',
	watermarkPath: 'public/brand/watermark.png',
	brandColor: '#12A077',
	banks: [
		{
			accountName: 'THINKCRYPT',
			accountNo: '1503097971001',
			bankName: 'The City Bank',
			branch: 'Dhanmondi',
			isDefault: true,
		},
	],
	codePrefix: {
		document: 'INV-',
		quotation: 'QTN-',
	},
	footerNote:
		'***THANK YOU FOR CHOOSING THINKCRYPT. WE LOOK FORWARD TO SERVE YOU AGAIN.\nFor Assistance please call 01828398225 or email at: thinkcrypt@gmail.com',
	signature: {
		defaultName: 'Asif Istiaque',
	},
};

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

const seedBillingProfile = async () => {
	try {
		// Upsert on slug so re-running this script is always safe: creates the
		// doc the first time, refreshes it to these literal values on every
		// later run.
		const saved = await Content.findOneAndUpdate(
			{ slug: 'billing-profile' },
			{
				name: 'Billing Profile',
				slug: 'billing-profile',
				contentType: 'custom',
				status: 'published',
				content: { data: billingProfile },
			},
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		);

		if (saved) {
			console.log('Billing profile seeded, id:', saved._id.toString());
		} else {
			console.log('Error: Billing profile could not be seeded');
		}
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		mongoose.connection.close();
		console.log('Connection closed');
		console.log('Exiting process with status code 0');
		process.exit(0);
	}
};

seedBillingProfile();

app.listen(5000, () => {
	console.log(`Server running on port 5000`);
});
