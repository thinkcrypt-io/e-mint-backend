import { Request, Response } from 'express';
import fs from 'fs';
import moment from 'moment';
import PDFDocument from 'pdfkit';
import sendMail from '../mail/sendMail.controller.js';

const doc = new PDFDocument({ size: 'A4', margin: 40 });

const invoiceData = {
	_id: '6721f0952f2dd2d3ac53fc6f',
	user: '670d6f77db71c3672d56601c',
	items: [
		{
			name: 'Lorem Insum dolar sit amet Lorem Insum dolar sit amet Lorem Insum dolar sit amet ',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},

		{
			name: 'Jeans Blue',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Lorem Insum dolar',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Lorem Insum dolar sit amet Lorem Insum dolar sit amet Lorem Insum dolar sit amet Lorem Insum dolar sit amet Lorem Insum dolar sit amet Lorem Insum dolar sit amet',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Lorem Insum dolar sit',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Jeans Blue',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},

		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Jeans Blue',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Jeans Blue',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Jeans Blue',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},

		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Jeans Blue',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Jeans Blue',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},

		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Jeans Blue',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Jeans Blue',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Lorem Insum dolar sit',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Jeans Blue',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},

		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Lorem Ipsum is simply dummy',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Lorem Ipsum is simply dummy',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},
		{
			name: 'Yoga Mat',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
		{
			name: 'Jeans Blue',
			_id: '6712b01ecbf611412037c8b0',
			qty: 12,
			unitPrice: 500,
			totalPrice: 6000,
			vat: 240,
			unitVat: 20,
			returnQty: 0,
			id: '6712b01ecbf611412037c8b0',
		},

		{
			name: 'Lorem Ipsum is simply dummy',
			_id: '6714e1534d236733c6121fb0',
			qty: 10,
			unitPrice: 800,
			totalPrice: 8000,
			vat: 0,
			unitVat: 0,
			returnQty: 0,
			id: '6714e1534d236733c6121fb0',
		},
	],
	total: 14240,
	returnAmount: 0,
	vat: 240,
	subTotal: 14000,
	isPaid: true,
	paidAmount: 14240,
	profit: 7600,
	dueAmount: 0,
	shippingCharge: 0,
	paymentMethod: 'cash',
	status: 'order-placed',
	customer: {
		_id: '670d7daeedab5d2739c26485',
		name: 'Asif Istiaque',
		email: 'devilasif332@gmail.com',
	},
	orderDate: '2024-10-30T08:38:45.106Z',
	isCancelled: false,
	discount: 0,
	isDelivered: true,
	shop: '670d6f77db71c3672d566018',
	note: 'this is nice product good to see you',
	origin: 'pos',
	createdAt: '2024-10-30T08:38:45.110Z',
	updatedAt: '2024-10-30T08:42:05.216Z',
	invoice: '0011',
	__v: 0,
	delivery: '6721f0f52f2dd2d3ac53fca1',
	totalItems: 22,
	name: '0011',
	id: '6721f0952f2dd2d3ac53fc6f',
};

doc.registerFont('SegoeUI-Regular', 'public/fonts/SegoeUI.ttf');
doc.registerFont('SegoeUI-Bold', 'public/fonts/SegoeUIBold.ttf');

// const refundPolicy = [
// 	'Payment due within 30 days',
// 	'Warranty 1-year limited',
// 	'Returns within 15 days',
// 	'Late fee 1.5% monthly',
// ];

const termsAndCondition =
	'By placing an order, you agree to our terms and conditions. All sales are subject to availability, and we reserve the right to modify or cancel orders as needed.';
const contactInfo = {
	flat: 'Flat 5B, House 88',
	road: 'Road 17/A, Block-E, Banani, Dhaka 1213',
	telephone: '+8801828398225, info@thinkcrypt.io',
};

// const currencyIcon = '৳';

const formattedDate = moment(invoiceData?.orderDate).format('DD/MM/YYYY'); // Format to '01/01/2024'

const renderHeader = () => {
	doc
		.font('SegoeUI-Bold')
		.fontSize(24)
		.text('INVOICE', 40, 40)
		.font('SegoeUI-Regular')
		.fontSize(10)
		.text(`Invoice Date: ${formattedDate}`, 40, 50, { align: 'right' });

	doc.moveDown(1);

	doc
		.fontSize(10)
		.text('Invoice No', 40, 70, { width: 100, align: 'left' })
		.text(`: #${invoiceData?.invoice}`, 90, 70, { width: 100, align: 'left' });

	doc
		.fontSize(10)
		.text('Total Due', 40, 82, { width: 100, align: 'left' })
		.text(`: ${invoiceData?.dueAmount} BDT`, 90, 82, {
			width: 100,
			align: 'left',
		});

	doc.moveDown(1);
	doc
		.moveTo(40, 100) // Starting point of the line
		.lineTo(doc.page.width - doc.page.margins.right, 100) // Ending point of the line (adjust width as needed)
		.lineWidth(1) // Thickness of the line
		.strokeColor('#000') // Color of the line (black in this case)
		.stroke();
};

const renderPaymentInfo = () => {
	const spaceY = 20;
	const initialDocY = doc.y;
	const leftSpacing = 340;
	const spaceColumnPayment = 120;
	const spaceColumnInvoice = 110;
	doc
		.font('SegoeUI-Bold')
		.fontSize(14)
		.text('PAYMENT INFO', 40, initialDocY, { align: 'left' });

	doc.font('SegoeUI-Regular');
	doc
		.fontSize(10)
		.text('Account Name', 40, initialDocY + spaceY, {
			width: spaceColumnPayment,
			align: 'left',
		})
		.text(
			`: ${invoiceData?.customer?.name}`,
			spaceColumnPayment,
			initialDocY + spaceY,
			{
				align: 'left',
			}
		);

	doc
		.fontSize(10)
		.text('Payment Type', 40, initialDocY + spaceY + 16, {
			width: spaceColumnPayment,
			align: 'left',
		})
		.text(
			`: ${
				invoiceData?.paymentMethod == 'cash'
					? 'COD'
					: invoiceData?.paymentMethod
			}`,
			spaceColumnPayment,
			initialDocY + spaceY + 16,
			{
				width: 100,
				align: 'left',
			}
		);

	doc
		.fontSize(10)
		.text('Payment Number', 40, initialDocY + spaceY + 32, {
			width: spaceColumnPayment,
			align: 'left',
		})
		.text(': 01700000000', spaceColumnPayment, initialDocY + spaceY + 32, {
			width: 100,
			align: 'left',
		});
	doc.moveDown(0);

	// INVOICE TO PART
	doc
		.font('SegoeUI-Bold')
		.fontSize(14)
		.text('INVOICE TO', leftSpacing, initialDocY, { align: 'left' });

	doc.font('SegoeUI-Regular');
	doc
		.fontSize(10)
		.text(`Name`, leftSpacing, initialDocY + spaceY, {
			width: 120,
			align: 'left',
		})
		.text(
			`: ${invoiceData?.customer?.name}`,
			leftSpacing + 40,
			initialDocY + spaceY,
			{
				align: 'left',
			}
		);

	doc
		.fontSize(10)
		.text(`Address`, leftSpacing, initialDocY + spaceY + 16, {
			width: 120,
			align: 'left',
		})
		.text(
			`: House-88, Road-17/A, Banani, Dhaka`,
			leftSpacing + 40,
			initialDocY + spaceY + 16,
			{
				align: 'left',
			}
		);

	doc
		.fontSize(10)
		.text('Phone', leftSpacing, initialDocY + spaceY + 32, {
			width: 120,
			align: 'left',
		})
		.text(`: 01300000000`, leftSpacing + 40, initialDocY + spaceY + 32, {
			align: 'left',
		});

	doc
		.fontSize(10)
		.text('E-mail', leftSpacing, initialDocY + spaceY + 46, {
			width: 120,
			align: 'left',
		})
		.text(
			`: ${invoiceData?.customer?.email || '...'}`,
			leftSpacing + 40,
			initialDocY + spaceY + 46,
			{
				align: 'left',
			}
		);

	// doc.moveDown(1);
};

const renderTermsAndCondition = () => {
	const spaceY = 5;
	const initialDocY = doc.y;
	const leftSpacing = 380;

	doc
		.font('SegoeUI-Bold')
		.fontSize(14)
		.text('Terms & Condition', 40, initialDocY + spaceY, { align: 'left' });

	doc.font('SegoeUI-Regular');

	doc.fontSize(10).text(`${termsAndCondition}`, 40, initialDocY + spaceY + 20, {
		width: leftSpacing - 100,
		align: 'left',
	});

	// termsAndCondition.forEach((item, i) => {
	// 	doc
	// 		.fontSize(10)
	// 		.text(`${item}`, 40, initialDocY + spaceY + (i + 1.2) * 16, {
	// 			width: leftSpacing - 20,
	// 			align: 'left',
	// 		});
	// });

	// doc.fontSize(12).text('Refund Policy', leftSpacing, initialDocY + spaceY, {
	// 	align: 'left',
	// });

	// refundPolicy.forEach((item, i) => {
	// 	doc
	// 		.fontSize(10)
	// 		.text(`• ${item}`, leftSpacing, initialDocY + spaceY + (i + 1.2) * 12, {
	// 			// width: 100,
	// 			align: 'left',
	// 		});
	// });
	doc.moveDown(1);
};

const renderTableHeader = () => {
	const initialDocY = doc.y; // Starting Y position for the header
	const padding = 6; // Padding inside each cell
	const headerHeight = 24; // Height for each header cell
	const pageWidth =
		doc.page.width - doc.page.margins.left - doc.page.margins.right;

	// Column width allocations
	const nameColumnWidth = pageWidth * 0.4; // "Name" takes 40% of the page width
	const otherColumnsWidth = (pageWidth * 0.6) / 3; // Each remaining column takes 1/3 of the remaining 60%

	const tableBorderColor = '#4A5568';

	// Set font size and text color
	doc.fontSize(10).fillColor('#000');

	// Draw cell for "Name" header
	doc
		.rect(40, initialDocY, nameColumnWidth, headerHeight)
		.lineWidth(1)
		.strokeColor(tableBorderColor)
		.stroke();

	// Render "Name" text within the cell
	doc
		.font('SegoeUI-Bold')
		.text('Product Name', 40 + padding, initialDocY + padding, {
			width: nameColumnWidth - 2 * padding,
			align: 'left',
		});

	// Draw cell for "Qty" header
	doc
		.rect(40 + nameColumnWidth, initialDocY, otherColumnsWidth, headerHeight)
		.lineWidth(1)
		.strokeColor(tableBorderColor)
		.stroke();

	// Render "Qty" text within the cell
	doc
		.font('SegoeUI-Bold')
		.text('Qty', 40 + nameColumnWidth + padding, initialDocY + padding, {
			width: otherColumnsWidth - 2 * padding,
			align: 'left',
		});

	// Draw cell for "Unit Price" header
	doc
		.rect(
			40 + nameColumnWidth + otherColumnsWidth,
			initialDocY,
			otherColumnsWidth,
			headerHeight
		)
		.lineWidth(1)
		.strokeColor(tableBorderColor)
		.stroke();

	// Render "Unit Price" text within the cell
	doc
		.font('SegoeUI-Bold')
		.text(
			'Unit Price',
			40 + nameColumnWidth + otherColumnsWidth + padding,
			initialDocY + padding,
			{
				width: otherColumnsWidth - 2 * padding,
				align: 'left',
			}
		);

	// Draw cell for "Total" header
	doc
		.rect(
			40 + nameColumnWidth + 2 * otherColumnsWidth,
			initialDocY,
			otherColumnsWidth,
			headerHeight
		)
		.lineWidth(1)
		.strokeColor(tableBorderColor)
		.stroke();

	// Render "Total" text within the cell
	doc
		.font('SegoeUI-Bold')
		.text(
			'Total',
			40 + nameColumnWidth + 2 * otherColumnsWidth + padding,
			initialDocY + padding,
			{
				width: otherColumnsWidth - 2 * padding,
				align: 'right',
			}
		);

	doc.font('SegoeUI-Regular');
};

const renderTableRow = (items: any) => {
	let currentYPosition = doc.y + 5;
	const padding = 4;
	const pageWidth =
		doc.page.width - doc.page.margins.left - doc.page.margins.right;
	const pageHeight =
		doc.page.height - doc.page.margins.top - doc.page.margins.bottom - 240;
	const footerHeight = 150; // Estimated height needed for the footer
	const nameColumnWidth = pageWidth * 0.4;
	const otherColumnsWidth = (pageWidth * 0.6) / 3;
	const borderHeight = 0.5;
	const tableBorderColor = '#4A5568';
	const rowMinimumHeight = 22;

	doc.fillColor('#303030').fontSize(10);

	let remainingPageHeight = pageHeight; // Track remaining height on the page

	console.log('RemainignPageHeight=', remainingPageHeight, '');

	items.forEach((item: any, index: number) => {
		// Calculate the row height based on the item's name length
		const descriptionHeight = doc.fontSize(10).heightOfString(item.name, {
			width: nameColumnWidth - 2 * padding,
		});
		const rowHeight = Math.max(
			descriptionHeight + 2 * padding,
			rowMinimumHeight
		);

		// Check if adding this row would exceed the available page height
		if (remainingPageHeight - rowHeight < footerHeight) {
			// Add a new page and reset values for the new page
			renderBrandLogo();
			renderFooter();
			doc.addPage();
			renderHeader();
			renderTableHeader(); // Re-render the table header on the new page
			currentYPosition = doc.y + 5; // Reset Y position for the new page
			remainingPageHeight = pageHeight + 140; // Reset remaining height for the new page
		}

		// Draw and render each cell
		doc
			.rect(40, currentYPosition, nameColumnWidth, rowHeight)
			.lineWidth(borderHeight)
			.strokeColor(tableBorderColor)
			.stroke();
		doc.text(item.name, 40 + padding, currentYPosition + padding, {
			width: nameColumnWidth - 2 * padding,
			align: 'left',
		});

		doc
			.rect(
				40 + nameColumnWidth,
				currentYPosition,
				otherColumnsWidth,
				rowHeight
			)
			.lineWidth(borderHeight)
			.strokeColor(tableBorderColor)
			.stroke();
		doc.text(
			item.qty,
			40 + nameColumnWidth + padding,
			currentYPosition + padding,
			{
				width: otherColumnsWidth - 2 * padding,
				align: 'left',
			}
		);

		doc
			.rect(
				40 + nameColumnWidth + otherColumnsWidth,
				currentYPosition,
				otherColumnsWidth,
				rowHeight
			)
			.lineWidth(borderHeight)
			.strokeColor(tableBorderColor)
			.stroke();
		doc.text(
			`${item.unitPrice}`,
			40 + nameColumnWidth + otherColumnsWidth + padding,
			currentYPosition + padding,
			{
				width: otherColumnsWidth - 2 * padding,
				align: 'left',
			}
		);

		doc
			.rect(
				40 + nameColumnWidth + 2 * otherColumnsWidth,
				currentYPosition,
				otherColumnsWidth,
				rowHeight
			)
			.lineWidth(borderHeight)
			.strokeColor(tableBorderColor)
			.stroke();
		doc.text(
			`${item.totalPrice}`,
			40 + nameColumnWidth + 2 * otherColumnsWidth + padding,
			currentYPosition + padding,
			{
				width: otherColumnsWidth - 2 * padding,
				align: 'right',
			}
		);

		// Move to the next row's Y position based on this row's height
		currentYPosition += rowHeight;
		remainingPageHeight -= rowHeight; // Update remaining height on the page
	});
};

const renderSummary = () => {
	const summaryStartY = doc.y + 16; // Starting Y position for the summary, a bit below the last row

	let subTotal = invoiceData?.subTotal;
	let vat = invoiceData?.vat;
	let discountAmount = invoiceData?.discount;
	let total = invoiceData?.total;
	let dueAmount = invoiceData?.dueAmount;
	let paidAmount = invoiceData?.paidAmount;
	let spaceY = 14;

	const tablePadding = 10; // Padding between columns

	doc.fillColor('#000').fontSize(10);

	const leftSpacing = 350;

	// const logoPosition =
	// 	doc.page.height - (doc.page.margins.bottom + doc.page.margins.top) - 70;

	// // Render Logo
	// doc.image('public/logo.png', 40, logoPosition, { width: 100 });
	// Object.values(contactInfo).forEach((line, index) => {
	// 	doc
	// 		.fontSize(10)
	// 		.fillColor('#000')
	// 		.text(line, 40, logoPosition + 34 + index * 18, {
	// 			// width: summaryStartY - 20,
	// 			align: 'left',
	// 		});
	// });

	// Render SubTotal
	doc.text('Subtotal', leftSpacing, summaryStartY, {
		align: 'left',
	});
	doc.text(
		`${subTotal.toFixed(2)} BDT`,
		leftSpacing - tablePadding,
		summaryStartY,
		{
			align: 'right',
		}
	);

	// Render VAT
	const vatYPosition = summaryStartY + spaceY; // Move down for next line
	doc.text('VAT +', leftSpacing, vatYPosition, {
		align: 'left',
	});
	doc.text(`${vat.toFixed(2)} BDT`, leftSpacing, vatYPosition, {
		align: 'right',
	});

	// Render Discount Amount
	const discountYPosition = vatYPosition + spaceY;
	doc.text('Discount -', leftSpacing, discountYPosition, {
		align: 'left',
	});
	doc.text(`${discountAmount.toFixed(2)} BDT`, leftSpacing, discountYPosition, {
		align: 'right',
	});

	const lineYPosition = discountYPosition + spaceY;
	doc
		.moveTo(leftSpacing, discountYPosition + spaceY + 4)
		.lineTo(
			doc.page.width - doc.page.margins.right,
			discountYPosition + spaceY + 4
		)
		.lineWidth(1)
		.strokeColor('#000')
		.stroke();

	// Render Total
	doc.font('SegoeUI-Bold');
	const totalYPosition = lineYPosition + spaceY - 6;
	doc.text('Total', leftSpacing, totalYPosition, {
		align: 'left',
	});
	doc.text(`${total.toFixed(2)} BDT`, leftSpacing, totalYPosition, {
		align: 'right',
	});

	// Render Paid Amount
	const paidAmountYPosition = totalYPosition + spaceY;
	doc.text('Paid Amount', leftSpacing, paidAmountYPosition, {
		align: 'left',
	});
	doc.text(`${paidAmount.toFixed(2)} BDT`, leftSpacing, paidAmountYPosition, {
		align: 'right',
	});

	// Render Due Amount
	const dueAmountYPosition = paidAmountYPosition + spaceY;
	doc.text('Due Amount', leftSpacing, dueAmountYPosition, {
		align: 'left',
	});
	doc.text(`${dueAmount.toFixed(2)} BDT`, leftSpacing, dueAmountYPosition, {
		align: 'right',
	});

	doc.font('SegoeUI-Regular');
};

const renderBrandLogo = () => {
	const logoPosition =
		doc.page.height - (doc.page.margins.bottom + doc.page.margins.top) - 70;

	// Render Logo
	doc.image('public/logo.png', 40, logoPosition, { width: 100 });
	Object.values(contactInfo).forEach((line, index) => {
		doc
			.fontSize(10)
			.fillColor('#000')
			.text(line, 40, logoPosition + 34 + index * 18, {
				// width: summaryStartY - 20,
				align: 'left',
			});
	});
};

const renderFooter = () => {
	// const pageHeight = doc.page.height - (doc.page.margins.top + 16);
	const yPosition =
		doc.page.height - (doc.page.margins.bottom + doc.page.margins.top) + 25;
	const leftCenter =
		(doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;

	doc
		.font('SegoeUI-Bold')
		.fontSize(10)
		.text('Powered by : MINT', leftCenter, yPosition);

	doc.font('SegoeUI-Regular');
};
const exportPDF = async (req: Request, res: Response): Promise<Response> => {
	try {
		doc.font('SegoeUI-Regular');
		const orderId = Date.now();
		const pdfPath = `public/pdf/order_${orderId}.pdf`;
		let isFirstPage = true;
		doc.pipe(fs.createWriteStream(pdfPath));

		// Render header and initial information only once at the start of the document
		renderHeader();

		if (isFirstPage) {
			renderPaymentInfo();
			renderTermsAndCondition();
			isFirstPage = false;
		}

		renderTableHeader();

		// Pass all items to renderTableRow, which will handle pagination dynamically
		renderTableRow(invoiceData.items);

		renderSummary();
		renderBrandLogo();
		renderFooter();

		doc.end();

		// sendMail({
		// 	to: 'arefin.thinkcrypt@gmail.com',
		// 	subject: 'Your Invoice',
		// 	body: 'Please find your invoice attached.',
		// 	pdfPath: pdfPath,
		// });

		return res
			.status(201)
			.json({ message: `PDF generated and email sent with download link.` });
	} catch (error) {
		console.error('Error while generating PDF:', error);
		return res.status(500).send('Internal Server Error');
	}
};

export default exportPDF;
