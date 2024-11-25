import { Document, Types } from 'mongoose';
import SettingType from '../../lib/types/settings.types';

export type TermConditionType = Document & {
	body: string;
	// views: number;
};

export type TermConditionSettings = {
	body: SettingType;
	// views: SettingType;
	
};