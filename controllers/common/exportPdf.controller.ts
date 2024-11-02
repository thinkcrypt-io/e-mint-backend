// import { Response } from 'express';
// import mongoose from 'mongoose';
// import PDFDocument from 'pdfkit';

// const exportDocument = ({ model, populate }: { model: mongoose.Model<any>; populate?: any }) => {
// 	return async (req: any, res: Response): Promise<any> => {
// 		try {
// 			// Query the MongoDB database
// 			const { ids, fields } = req.body;

// 			const query = ids && Array.isArray(ids) && ids.length > 0 ? { _id: { $in: ids } } : {};

// 			const info = await model
// 				.find(query)
// 				.populate(populate || '')
// 				.lean(); // Use .lean() for performance if you don't need Mongoose documents

// 			const modifiedInfo = info.map((item: any) => {
// 				let data = { ...item }; // Create a shallow copy of the item

// 				// Iterate over each key in the data object
// 				fields.forEach((field: string) => {
// 					const keys = field.split('.'); // Split the field by dot to handle nested fields

// 					if (keys.length === 1) {
// 						// Single level field
// 						const key = keys[0];

// 						if (data.hasOwnProperty(key)) {
// 							if (data[key] instanceof Date) {
// 								data[key] = data[key].toISOString().split('T')[0];
// 							} else if (typeof data[key] === 'number') {
// 								data[key] = data[key].toString();
// 							}
// 						}
// 					} else if (keys.length === 2) {
// 						// Nested field (e.g., category.name)
// 						const [parentKey, childKey] = keys;

// 						if (data.hasOwnProperty(parentKey) && data[parentKey]?.hasOwnProperty(childKey)) {
// 							if (data[parentKey][childKey] instanceof Date) {
// 								data[parentKey][childKey] = data[parentKey][childKey].toISOString().split('T')[0];
// 							} else if (typeof data[parentKey][childKey] === 'number') {
// 								data[parentKey][childKey] = data[parentKey][childKey].toString();
// 							}
// 						}
// 					}
// 				});

// 				return data; // Return the modified item
// 			});

// 			// Create a new PDF document
// 			const doc = new PDFDocument({ margin: 30 });

// 			// Set the headers to indicate a file download with the PDF format
// 			const date = new Date();
// 			const dateTimeString = date
// 				.toISOString()
// 				.replace(/[-:.]/g, '')
// 				.split('T')
// 				.join('_')
// 				.slice(0, 15);
// 			res.setHeader('Content-Type', 'application/pdf');
// 			res.setHeader('Content-Disposition', `attachment; filename=${dateTimeString}.pdf`);

// 			// Pipe the PDF document to the response
// 			doc.pipe(res);

// 			// Add a title to the PDF
// 			doc.fontSize(20).text('Exported Data', { align: 'center' });

// 			// Define table properties
// 			const tableTop = 100;
// 			const itemHeight = 30;
// 			const columnWidth = 100;

// 			// Draw table header
// 			doc
// 				.fontSize(10)
// 				.fillColor('white')
// 				.rect(30, tableTop, fields.length * columnWidth, itemHeight)
// 				.fill('#333');
// 			fields.forEach((field: string, i: number) => {
// 				doc
// 					.fillColor('white')
// 					.text(field, 30 + i * columnWidth, tableTop + 10, { width: columnWidth, align: 'left' });
// 			});

// 			// Draw table rows
// 			modifiedInfo.forEach((item: any, rowIndex: number) => {
// 				const rowTop = tableTop + (rowIndex + 1) * itemHeight;
// 				fields.forEach((field: string, colIndex: number) => {
// 					const keys = field.split('.');
// 					let value = item;
// 					keys.forEach((key: string) => {
// 						value = value[key];
// 					});
// 					doc.fillColor('black').text(value || '', 30 + colIndex * columnWidth, rowTop + 10, {
// 						width: columnWidth,
// 						align: 'left',
// 					});
// 				});
// 				// Draw row borders
// 				doc.rect(30, rowTop, fields.length * columnWidth, itemHeight).stroke();
// 			});

// 			// Draw table borders
// 			for (let i = 0; i <= fields.length; i++) {
// 				doc
// 					.moveTo(30 + i * columnWidth, tableTop)
// 					.lineTo(30 + i * columnWidth, tableTop + (modifiedInfo.length + 1) * itemHeight)
// 					.stroke();
// 			}
// 			doc
// 				.moveTo(30, tableTop)
// 				.lineTo(30 + fields.length * columnWidth, tableTop)
// 				.stroke();
// 			doc
// 				.moveTo(30, tableTop + itemHeight)
// 				.lineTo(30 + fields.length * columnWidth, tableTop + itemHeight)
// 				.stroke();
// 			doc
// 				.moveTo(30, tableTop + (modifiedInfo.length + 1) * itemHeight)
// 				.lineTo(30 + fields.length * columnWidth, tableTop + (modifiedInfo.length + 1) * itemHeight)
// 				.stroke();

// 			// Finalize the PDF and end the stream
// 			doc.end();
// 		} catch (error) {
// 			console.error('Error while generating PDF:', error);
// 			res.status(500).send('Internal Server Error');
// 		}
// 	};
// };

// export default exportDocument;

import { Response } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';

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

			// Create a new PDF document
			const doc = new PDFDocument({ margin: 30 });

			// Set the headers to indicate a file download with the PDF format
			const date = new Date();
			const dateTimeString = date
				.toISOString()
				.replace(/[-:.]/g, '')
				.split('T')
				.join('_')
				.slice(0, 15);
			res.setHeader('Content-Type', 'application/pdf');
			res.setHeader('Content-Disposition', `attachment; filename=${dateTimeString}.pdf`);

			// Pipe the PDF document to the response
			doc.pipe(res);

			// Add a title to the PDF
			doc.fontSize(20).text('Exported Data', { align: 'center' });

			// Define table properties

			const tableTop = 64;
			const itemHeight = 44;
			const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
			const columnWidth = pageWidth / fields.length;

			// const columnWidth = 60;
			const padding = 4;

			// Function to draw table header

			//doc;
			// 				.fontSize(10)
			// 				.fillColor('white')
			// 				.rect(30, tableTop, fields.length * columnWidth, itemHeight)
			// 				.fill('#333');
			// 			fields.forEach((field: string, i: number) => {
			// 				doc
			// 					.fillColor('white')
			// 					.text(field, 30 + i * columnWidth, tableTop + 10, { width: columnWidth, align: 'left' });
			// 			});

			const headerHeight = 34;

			const drawTableHeader = () => {
				doc
					.fontSize(10)
					.fillColor('white')
					.rect(30, tableTop, fields.length * columnWidth, headerHeight)
					.fill('#333');
				fields.forEach((field: string, i: number) => {
					doc.fillColor('white').text(field, 30 + i * columnWidth + padding, tableTop + 10, {
						width: columnWidth,
						align: 'left',
					});
				});

				// doc.rect(30 * columnWidth, tableTop, columnWidth, itemHeight).stroke();

				// doc.rect(doc.page.margins.left, rowTop, pageWidth, itemHeight).stroke();

				doc
					.moveTo(doc.page.margins.left, tableTop) // Move to the top-left corner
					.lineTo(doc.page.margins.left + pageWidth, tableTop) // Draw the top border
					.moveTo(doc.page.margins.left, tableTop) // Move back to the top-left corner
					.lineTo(doc.page.margins.left, tableTop + headerHeight) // Draw the left border
					.moveTo(doc.page.margins.left + pageWidth, tableTop) // Move to the top-right corner
					.lineTo(doc.page.margins.left + pageWidth, tableTop + headerHeight) // Draw the right border
					.stroke();

				doc.moveDown();
			};

			// Function to draw table row
			const drawTableRow = (item: any, rowIndex: number) => {
				const rowTop = doc.y;
				fields.forEach((field: string, colIndex: number) => {
					const keys = field.split('.');
					let value = item;
					keys.forEach((key: string) => {
						value = value[key];
					});
					value = value || '--';

					doc
						.fillColor('black')
						.text(value, doc.page.margins.left + colIndex * columnWidth + padding, rowTop + 20, {
							width: columnWidth - 2 * padding,
							align: 'left',
						});
				});

				doc
					.moveTo(doc.page.margins.left, rowTop + itemHeight) // Move to the top-left corner
					.lineTo(doc.page.margins.left + pageWidth, rowTop + itemHeight) // Draw the top border
					.moveTo(doc.page.margins.left, rowTop) // Move back to the top-left corner
					.lineTo(doc.page.margins.left, rowTop + itemHeight) // Draw the left border
					.moveTo(doc.page.margins.left + pageWidth, rowTop) // Move to the top-right corner
					.lineTo(doc.page.margins.left + pageWidth, rowTop + itemHeight) // Draw the right border
					.stroke();
				doc.moveDown();
			};

			// Draw table header
			drawTableHeader();

			// Draw table rows
			modifiedInfo.forEach((item: any, rowIndex: number) => {
				if (doc.y + itemHeight > doc.page.height - doc.page.margins.bottom) {
					doc.addPage();
					drawTableHeader();
				}
				drawTableRow(item, rowIndex);
			});

			// Finalize the PDF and end the stream
			doc.end();
		} catch (error) {
			console.error('Error while generating PDF:', error);
			res.status(500).send('Internal Server Error');
		}
	};
};

export default exportDocument;
