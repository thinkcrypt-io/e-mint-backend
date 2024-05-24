import QR from '../../models/qr/qr.model.js';

const createOrUpdateQR = async (req: any, res: any) => {
	const { restaurantId, ...qrData } = req.body;

	try {
		let qr = await QR.findOne({ restaurant: restaurantId });

		if (qr) {
			// Update existing QR code
			qr = await QR.findOneAndUpdate({ restaurant: restaurantId }, { $set: qrData }, { new: true });
		} else {
			// Create new QR code
			qr = new QR({ restaurant: restaurantId, ...qrData });
			await qr.save();
		}

		res.status(200).json(qr);
	} catch (e: any) {
		res.status(500).json({ message: e.message });
	}
};

export default createOrUpdateQR;
