import { Document, Schema, Types } from 'mongoose';

type DocumentBaseType = {
	createdAt?: Date;
	updatedAt?: Date;
};

type ProjectType = DocumentBaseType & {
	name: string;
	projectType: 'frontend' | 'backend' | 'fullstack' | 'android' | 'ios' | 'admin' | 'other';
	category: string;
	clientName?: string;
	devUrl?: string;
	client?: Types.ObjectId;
	project?: Types.ObjectId;
	liveUrl?: string;
	testUrl?: string;
	prodUrl?: string;
	githubUrl?: string;
	domain?: string;
	hostingServer?: string;
	description?: string;
	status?: string;
	technologies?: string[];
	frameworks?: string[];
	libraries?: string[];
	isActive?: boolean;
};

export default ProjectType;
