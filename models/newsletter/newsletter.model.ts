import mongoose, { Schema } from 'mongoose';


const schema = new Schema<any>(
	{
		shop: {
      type: Schema.Types.ObjectId,
			ref: 'Shop',
		},
    email:{
      type: String,
      required: true,
      trim:true
    },
    phone:{
      type: String
    },
    count:Number,
    isActive:{
      type: Boolean,
      default: true
    },
    status:{
      type:String,
      enum:['subscribed','un-subscribed','pending','archived','converted'],
    },
	},
	{
		timestamps: true,
	}
);



const Newsletter = mongoose.model<any>('Newsletter', schema);
export default Newsletter;
