import { Types } from 'mongoose';

type LocationType = {
	name: string;
	shortDescription?: string;
	description?: string;
	isActive?: boolean;
	image?: string;
	address?: string;
	shop: Types.ObjectId;
	tags: string[];
	phone?: string;
	email?: string;
};

export default LocationType;
