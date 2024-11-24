import SettingType from '@/lib/types/settings.types';

export type BillingInfoType = Document & {
	_id?: string;
	transactionId: string;
	transactionTime?: string;
	amount?: string;
	shop?: string;
	createdAt?: Date;
};

export type BillingInfoSettings = {
	transactionId: SettingType;
	transactionTime: SettingType;
	amount?: SettingType;
	shop: SettingType;
	createdAt?: SettingType;
};
