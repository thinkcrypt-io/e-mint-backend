import dotenv from 'dotenv';
import mongoose from 'mongoose';
import express from 'express';
import User from '../dist/models/user/user.model.js';
import bcrypt from 'bcrypt';

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

const createAdmin = async () => {
	try {
		const admin = await User.findOne();
		if (admin) {
			console.log('Admin already exists');
		} else {
			const salt = await bcrypt.genSalt(10);
			const password = await bcrypt.hash('11223344', salt);

			const adminUser = new User({
				name: 'Admin',
				email: 'asifistiaque.ai@gmail.com',
				role: 'super-admin',
				password: password,
				employeeId: '0',
			});
			const savedAdmin = await adminUser.save();
			if (savedAdmin) {
				console.log('Admin created, username: asifistiaque.ai@gmail.com, password: 11223344');
			} else {
				console.log('Error: Admin could not be created');
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

createAdmin();

app.listen(5000, () => {
	console.log(`Server running on port 5000`);
});
