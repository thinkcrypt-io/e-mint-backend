import { Types } from 'mongoose';
import SettingType from '../../lib/types/settings.types';
import { Document } from 'mongodb';

export type ShopFaqType = Document & {
	question: string;
	answer: string;
	shop?: Types.ObjectId;
};

export type ShopFaqSettings = {
	question: SettingType;
	answer: SettingType;
	shop?: SettingType;
	createdAt?: SettingType;
};
