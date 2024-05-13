import { Types } from 'mongoose';
import SettingType from '../../lib/types/settings.types';
import { Document } from 'mongodb';

export type CategoryType = Document & {
	_id?: string;
	name: string;
	description?: string;
	restaurant: Types.ObjectId;
	isActive: boolean;
	isDeleted?: boolean;
	image?: string;
	createdAt?: Date;
	updatedAt?: Date;
};

export type CategorySettings = {
	name: SettingType;
	description: SettingType;
	restaurant: SettingType;
	isActive: SettingType;
	isDeleted?: SettingType;
	image?: SettingType;
	createdAt?: SettingType;
};
