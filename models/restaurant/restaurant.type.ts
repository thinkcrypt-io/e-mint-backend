import { Types } from 'mongoose';
import SettingType from '../../lib/types/settings.types';
import { Document } from 'mongodb';

export type RestaurantType = Document & {
	_id?: string;
	name: string;
	description?: string;
	logo: string;
	coverImage: string;
	location: string;
	email: string;
	phone: string;
	membership?: Types.ObjectId;
	isDeleted: boolean;
	isActive: boolean;
	createdAt?: Date;
	updatedAt?: Date;
	template: number;
};

export type RestaurantSettings = {
	name: SettingType;
	description: SettingType;
	logo: SettingType;
	coverImage: SettingType;
	location: SettingType;
	email: SettingType;
	phone: SettingType;
	membership?: SettingType;
	isDeleted: SettingType;
	isActive: SettingType;
	createdAt?: SettingType;
	template?: number;
};
