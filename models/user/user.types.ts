import { Document } from 'mongodb';
import SettingType from '../../lib/types/settings.types';

export type UserType = Document & {
	name: string;
	// restaurant: string;
	username: string;
	email: string;
	phone: string;
	role: string;
	isActive: boolean;
	isDeleted: boolean;
	password: string;
	preferences: {
		categories: string[];
		items: string[];
		users: string[];
		shops: [String];
	};
};
export type UserSettings = {
	name: SettingType;
	// restaurant: SettingType;
	shop: SettingType;
	username: SettingType;
	email: SettingType;
	phone: SettingType;
	role: SettingType;
	isActive: SettingType;
	isDeleted: SettingType;
	password?: SettingType;
	preferences?: {
		categories: SettingType;
		items: SettingType;
		users: SettingType;
		shops: SettingType;
	};
};
