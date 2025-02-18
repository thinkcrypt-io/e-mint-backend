import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { getErrorMessage } from '../lib/index.js';

/**
 * Middleware: existCondition
 *
 * This middleware checks for duplicate entries in a MongoDB collection using Mongoose.
 * It examines specified fields from the request body (provided as a space-separated string),
 * constructs a query condition based on those fields, and then checks if a document matching
 * those conditions already exists in the database.
 *
 * If a duplicate is found, it returns a 400 response with a custom error message. If no duplicate
 * is found, it calls the next middleware/handler in the chain.
 *
 * @param {Object} options - The configuration options for this middleware.
 * @param {mongoose.Model<any>} options.model - The Mongoose model to query.
 * @param {string} options.fields - A space-separated string of field names to check in req.body.
 * @param {string} options.message - A custom error message for duplicate entries.
 *
 * @example
 * // Usage in an Express route:
 * router.post('/create', existCondition({
 *   model: UserModel,
 *   fields: 'email username',
 *   message: 'User with provided email or username already exists'
 * }), createUser);
 */

type ExistConditionType = {
	model: mongoose.Model<any>;
	fields: String;
	message: String;
};

const existCondition = ({ model, fields, message }: ExistConditionType) => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			// If either the fields or model is not provided, skip the check.
			if (!fields || !model) return next();

			// Split the space-separated fields into an array.
			const fieldArray = fields.split(' ');

			// Build a conditions object from the request body for each field provided.
			const conditions = fieldArray.reduce((acc: Record<string, any>, field) => {
				// Only include the field if it exists in req.body.
				if (req.body[field]) {
					acc[field] = req.body[field];
				}
				return acc;
			}, {});

			// If no conditions could be built, proceed to the next middleware.
			if (Object.keys(conditions).length === 0) {
				return next();
			}

			// Query the database to check if any document matches the conditions.
			const existingEntry = await model.findOne(conditions);

			// If a duplicate entry exists, return a 400 error response.
			if (existingEntry)
				return res.status(400).json({
					message: message || `Duplicate Entry Exists`,
				});

			// Proceed to the next middleware if no duplicate is found.
			next();
		} catch (error: any) {
			// In case of any errors,
			// extract the error message and return a 500 Internal Server Error response.
			const message = getErrorMessage(error);
			return res.status(500).json({ message });
		}
	};
};

export default existCondition;
