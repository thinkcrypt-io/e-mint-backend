import { parse } from 'json2csv';
import { Response } from 'express';
import mongoose from 'mongoose';

const exportDocument = ({ model, populate }: { model: mongoose.Model<any>; populate?: any }) => {
	return async (req: any, res: Response): Promise<any> => {
		try {
			// Query the MongoDB database
			const { ids, fields } = req.body;

			let query: any = ids && Array.isArray(ids) && ids.length > 0 ? { _id: { $in: ids } } : {};
			query.shop = req.shop;

			const info = await model
				.find(query)
				.populate(populate || '')
				.lean(); // Use .lean() for performance if you don't need Mongoose documents

			const modifiedInfo = info.map((item: any) => {
				let data = { ...item }; // Create a shallow copy of the item

				// Iterate over each key in the data object
				fields.forEach((field: string) => {
					const keys = field.split('.'); // Split the field by dot to handle nested fields

					if (keys.length === 1) {
						// Single level field
						const key = keys[0];

						if (data.hasOwnProperty(key)) {
							if (data[key] instanceof Date) {
								data[key] = data[key].toISOString().split('T')[0];
							} else if (typeof data[key] === 'number') {
								data[key] = data[key].toString();
							}
						}
					} else if (keys.length === 2) {
						// Nested field (e.g., category.name)
						const [parentKey, childKey] = keys;

						if (data.hasOwnProperty(parentKey) && data[parentKey]?.hasOwnProperty(childKey)) {
							if (data[parentKey][childKey] instanceof Date) {
								data[parentKey][childKey] = data[parentKey][childKey].toISOString().split('T')[0];
							} else if (typeof data[parentKey][childKey] === 'number') {
								data[parentKey][childKey] = data[parentKey][childKey].toString();
							}
						}
					}
				});

				return data; // Return the modified item
			});

			//console.log(modifiedInfo);

			// Convert JSON to CSV
			const csv = parse(modifiedInfo, {
				fields,
			}); // Specify fields to include in CSV

			const csvWithBom = '\ufeff' + csv;

			const date = new Date();
			const dateTimeString = date
				.toISOString()
				.replace(/[-:.]/g, '')
				.split('T')
				.join('_')
				.slice(0, 15);

			// Set the headers to indicate a file download with the CSV format
			res.setHeader('Content-Type', 'text/csv; charset=utf-8');
			res.setHeader('Content-Disposition', `attachment; filename=${dateTimeString}.csv`);

			// Send the CSV file data
			res.status(200).send(csvWithBom);
		} catch (error) {
			console.error('Error while generating CSV:', error);
			res.status(500).send('Internal Server Error');
		}
	};
};

export default exportDocument;
