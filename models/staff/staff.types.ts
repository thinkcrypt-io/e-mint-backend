import { Types } from 'mongoose';

type LocationType = {
	name: string;
	email: string;
	phone: string;
	role?: string;
	shop: Types.ObjectId;
	location: Types.ObjectId;
	isActive: boolean;
	isDeleted: boolean;
	password: string;
	preferences?: {};
	permissions?: [];
	lastActivity?: Date;
	lastActivityIp?: string;
	lastLoginTime?: Date;
	lastLoginIp?: string;
	devices?: [];
};

export default LocationType;
