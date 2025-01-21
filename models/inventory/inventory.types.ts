import { Types } from 'mongoose';

type LocationType = {
	product: Types.ObjectId;
	shop: Types.ObjectId;
	location: Types.ObjectId;
	stock: number;
	damage: number;
	lowStockAlert: number;
	reservedStock: number; // Stock reserved for pending orders
	incomingStock: number; // Stock currently on the way (e.g., from a supplier)
	incomingStockDate: Date; // Expected date of incoming stock
	lastRestockedAt: Date; // Last date the stock was restocked
};

export default LocationType;
