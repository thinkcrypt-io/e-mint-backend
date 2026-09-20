import mongoose, { Schema } from 'mongoose';

export const HISTORY_ACTIONS = ['create', 'update', 'delete'] as const;

export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

/** One field that changed in an update, kept both raw and pre-rendered. */
export type HistoryChange = {
	field: string;
	label: string;
	from: string;
	to: string;
};

const changeSchema = new Schema<HistoryChange>(
	{
		/** Schema path, e.g. `category`. */
		field: { type: String, required: true },
		/** Human title for that path from the model's settings, e.g. `Category`. */
		label: { type: String, required: true },
		/** Both sides are stored as display strings, not raw values: an audit
		 *  trail has to stay readable years later, after the referenced document
		 *  has been renamed or deleted and an ObjectId would resolve to nothing. */
		from: { type: String, default: '' },
		to: { type: String, default: '' },
	},
	{ _id: false }
);

const schema = new Schema<any>(
	{
		//Who
		user: { type: Schema.Types.ObjectId, ref: 'Admin' },
		/** Snapshot of the name at the time of the action — the admin may later be
		 *  renamed or removed, and the entry should still read correctly. */
		userName: { type: String, trim: true, default: 'Someone' },

		//What
		action: { type: String, enum: HISTORY_ACTIONS, required: true },

		//To which record
		/** Mongoose model name, e.g. `Meeting`. */
		model: { type: String, required: true, trim: true },
		/** Route segment the record is served under, e.g. `meetings`. This is what
		 *  the admin needs to open it: the view drawer is generic over
		 *  `path` + `id`, so storing it here means a history row can open any
		 *  record without a model -> path lookup table on the frontend. */
		modelPath: { type: String, required: true, trim: true },
		document: { type: Schema.Types.ObjectId, required: true },
		/** Snapshots, for the same reason as `userName`. */
		documentName: { type: String, trim: true, default: '' },
		documentCode: { type: String, trim: true, default: '' },

		//The readable sentence, rendered once at write time
		text: { type: String, required: true, trim: true },

		//Field-level detail, only for updates
		changes: { type: [changeSchema], default: [] },

		shop: { type: Schema.Types.ObjectId, ref: 'Shop' },
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

// The two reads this collection gets: the global page (newest first, filtered)
// and one record's own timeline.
schema.index({ createdAt: -1 });
schema.index({ document: 1, createdAt: -1 });

export default mongoose.model<any>('History', schema);
