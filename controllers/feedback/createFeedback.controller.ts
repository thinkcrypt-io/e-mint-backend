import mongoose from 'mongoose';
import Collection from '../../models/collection/collection.model.js';
import Feedback from '../../models/feedback/feedback.model.js';

const createFeedback = async (req: any, res: any) => {
	try {
		const { id, name, email, phone, description, rating } = req.body;

		const feedback = new Feedback({
			restaurant: id,
			name,
			email,
			phone,
			description,
			rating,
		});

		const saved = await feedback.save();

		return res.status(201).json(saved);
	} catch (e: any) {
		console.log(e);
		return res.status(500).json({ message: 'Internal Server Error' });
	}
};

export default createFeedback;
