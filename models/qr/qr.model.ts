import mongoose, { Schema, Types } from 'mongoose';
//import { RestaurantType } from './restaurant.type.js';

const schema = new Schema<any>(
	{
		// restaurant: {
		// 	type: mongoose.Schema.Types.ObjectId,
		// 	required: [true, 'Restaurant is required'],
		// },
		table: {
			type: mongoose.Schema.Types.ObjectId,
		},

		innerEyeRadius: {
			type: Number,
			default: 4,
		},
		outerEyeRadius: {
			type: Number,
			default: 4,
		},
		bgColor: {
			type: String,
			default: '#fff',
		},
		fgColor: {
			type: String,
			default: '#000',
		},
		pixelColor: {
			type: String,
			default: '#000',
		},
		outerPadding: {
			type: Number,
			default: 10,
		},
		qrStyle: {
			type: String,
			default: 'squares',
			enum: ['squares', 'dots', 'fluid'],
		},
		logo: {
			type: String,
		},
		logoPadding: {
			type: Number,
			default: 30,
		},
		logoPaddingStyle: {
			type: String,
			default: 'circle',
			enum: ['circle', 'square'],
		},
		removeQrCodeBehindLogo: {
			type: Boolean,
			default: true,
		},
		size: {
			type: Number,
			default: 300,
		},
		logoWidth: {
			type: Number,
			default: 100,
		},
		logoHeight: {
			type: Number,
			default: 100,
		},
		logoSize: {
			type: Number,
			default: 100,
		},

		isDeleted: {
			type: Boolean,
			default: false,
			required: true,
		},

		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},
	},

	{
		timestamps: true,
	}
);

const QR = mongoose.model<any>('Qr', schema);
//export { default as settings } from './restaurant.settings.js';
export default QR;
