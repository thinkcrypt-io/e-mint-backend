import dotenv from 'dotenv';
import mongoose from 'mongoose';
import express from 'express';
import Admin from '../dist/models/admin/admin.model.js';
import AdminRole from '../dist/models/admin/adminRole.model.js';

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
		const role = new AdminRole({
			name: 'super-admin',
			description: 'Super Admin Role',
			permissions: ['*'],
			isActive: true,
		});
		const savedRole = await role.save();
		const admin = await Admin.findOne();

		if (admin) {
			console.log('Admin already exists');
		} else {
			const password = 'smirnoff'; // await bcrypt.hash('smirnoff', salt);

			const adminUser = new Admin({
				name: 'Admin',
				email: 'info@thinkcrypt.io',
				phone: '01828398225',
				role: savedRole._id,
				password: password,
			});
			const savedAdmin = await adminUser.save();

			if (savedAdmin) {
				console.log('Admin created, username: info@thinkcrypt.io, password: smirnoff');
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
