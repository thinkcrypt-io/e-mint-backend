import { Request, Response } from 'express';
import mongoose from 'mongoose';

// Define proper types for schema info
interface SchemaInfo {
	modelName: string;
	collectionName: string;
	schemaFields: string[];
	indexes?: any[];
}

const listRegisteredSchemas = async (req: Request, res: Response) => {
	try {
		// Make sure connection is established
		if (mongoose.connection.readyState !== 1) {
			return res.status(500).json({
				success: false,
				message: 'MongoDB connection not established',
				connectionState: mongoose.connection.readyState,
			});
		}

		// Get registered models from mongoose
		const modelNames = mongoose.modelNames();
		const connectionModels = Object.keys(mongoose.connection.models);
		const globalModels = Object.keys((mongoose as any).models || {});

		// Check all connections for models
		const allConnectionModels: string[] = [];
		for (const connection of mongoose.connections) {
			if (connection.models) {
				allConnectionModels.push(...Object.keys(connection.models));
			}
		}

		// Get all registered model names
		const registeredModels = [
			...new Set([...modelNames, ...connectionModels, ...globalModels, ...allConnectionModels]),
		];

		// Get model instances for registered models
		const models = registeredModels
			.map(modelName => {
				try {
					const model = mongoose.model(modelName);
					return model;
				} catch (error) {
					console.error(`Error getting model ${modelName}:`, error);
					return null;
				}
			})
			.filter(model => model !== null);

		return res.status(200).json({
			doc: models
				.map(model => ({
					_id: model.modelName,
					name: model.modelName,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
			totalDocs: models.length,
		});
	} catch (error) {
		console.error('Error listing registered schemas:', error);

		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

		return res.status(500).json({
			success: false,
			error: 'Failed to list registered schemas',
			message: errorMessage,
		});
	}
};

export default listRegisteredSchemas;
