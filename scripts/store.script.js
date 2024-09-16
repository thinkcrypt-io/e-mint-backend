import dotenv from 'dotenv';
import mongoose from 'mongoose';
import express from 'express';
import Store from '../dist/models/store/store.model.js';

dotenv.config();
const app = express();

const hero = {
	image:
		'https://nexa-clothing.myshopify.com/cdn/shop/files/main-banner-four.png?v=1722417191&width=3840',
	title: 'Welcome to Nexa Clothing',
	subTitle:
		'Discover our Premium fitness and yoga gears designed for ultimate performance and comfort',
	btnText: 'Shop Now',
	href: '#',
};

const discoverData = {
	title: 'Discover The True Essence Of Style With Our Exclusive Premium Fashion Collection',
	subTitle: 'Discover your unique style today',
	items: [
		{
			btnText: 'Explore',
			href: '#',
			image:
				'https://images.pexels.com/photos/28271086/pexels-photo-28271086/free-photo-of-adidas-shoes-buty-sklep-z-butami-retail-store-shoes.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
		},
		{
			btnText: 'About Us',
			href: '#',
			image:
				'https://images.pexels.com/photos/2294403/pexels-photo-2294403.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
		},
	],
};

const aboutData = {
	title: 'Transform Your Workout Experience',
	subTitle:
		'At Mint Fashion, we specialize in blending style with sustainability. Our unique designs are crafted from premium, eco-friendly materials, ensuring comfort and quality. We focus on timeless fashion that reflects your individuality, making every piece a statement of personal expression and environmental consciousness.',
	image:
		'https://images.pexels.com/photos/179909/pexels-photo-179909.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
};

const collections = {
	title: 'Discover Every Style',
	subTitle: 'Unveil your distinct style today.',
	btnText: 'View Collections',
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

const createStore = async () => {
	try {
		const ifExists = await Store.findOne();
		if (ifExists) {
			console.log('Store already exists');
		} else {
			const newStore = new Store({
				name: 'Nexa Clothing',
				hero,
				content: {
					hero,
					about: aboutData,
					discover: discoverData,
					collections,
				},
			});
			const savedStore = await newStore.save();
			if (savedStore) {
				console.log('Store created, store data: ', savedStore);
			} else {
				console.log('Error: Store could not be created');
			}
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

createStore();

app.listen(5000, () => {
	console.log(`Server running on port 5000`);
});
