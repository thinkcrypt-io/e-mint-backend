import Joi from 'joi';
import { Request, Response } from 'express';
import { Shop, User, Role, getErrorMessage } from '../../imports.js';

type RequestType = Request & {
	body: {
		name: string;
		email: string;
		password: string;
		confirm: string;
		shopName: string;
		phone: string;
	};
};

const shopRegisterController = async (req: RequestType, res: Response): Promise<Response> => {
	const { error } = validate(req.body);
	if (error) return res.status(400).send({ message: error.details[0].message });

	if (req.body.password !== req.body.confirm) {
		return res.status(400).send({ message: 'Passwords do not match' });
	}

	try {
		const { name, email, password, shopName, phone } = req.body;

		const userExists = await User.findOne({ email });
		if (userExists) {
			return res.status(400).json({
				status: 'error',
				message: 'This email is already registered',
			});
		}

		const shopExists = await Shop.findOne({ email });
		if (shopExists) {
			return res.status(400).json({
				status: 'error',
				message: 'Shop with this email is already registered',
			});
		}

		const savedShop = await createShop({ name: shopName, email, phone });
		const savedRole = await createRole({ shop: savedShop._id, name: 'Owner', permissions: ['*'] });
		const savedUser = await createUser({
			name,
			email,
			password,
			shop: savedShop._id,
			role: savedRole._id,
		});

		savedShop.owner = savedUser._id;
		const updatedShop = await savedShop.save();

		const token = savedUser.generateAuthToken();

		return res
			.status(200)
			.header('x-auth-token', token)
			.json({ token: `Bearer ${token}`, user: savedUser, role: savedRole, shop: updatedShop });
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).json({ message });
	}
};

function validate(data: any): Joi.ValidationResult {
	const schema = Joi.object({
		name: Joi.string().min(2).max(50).required().messages({
			'any.required': 'Name is required',
			'string.min': 'Name must be at least 2 characters long',
		}),
		shopName: Joi.string().min(2).max(50).required().messages({
			'any.required': 'Shop Name is required',
			'string.min': 'Shop Name must be at least 2 characters long',
		}),
		email: Joi.string().max(255).required().email().messages({
			'any.required': 'Email is required',
			'string.email': 'Invalid Email, please enter a valid email address',
		}),
		password: Joi.string().min(6).max(255).required().messages({
			'any.required': 'Password is required',
			'string.min': 'Password must be 6 characters long',
		}),
		confirm: Joi.ref('password'),
		phone: Joi.string().min(11).allow(null, ''),
	});
	return schema.validate(data);
}

async function createShop({ name, email, phone }: { name: string; email: string; phone: string }) {
	const expire = new Date();
	expire.setDate(expire.getDate() + 15);
	const shop = new Shop({ name, email, phone, expire });
	return await shop.save();
}

async function createRole({
	name,
	shop,
	permissions,
}: {
	name: string;
	shop: any;
	permissions: string[];
}) {
	const role = new Role({
		name,
		shop,
		permissions,
	});
	return await role.save();
}

const createUser = async ({
	name,
	email,
	password,
	shop,
	role,
}: {
	name: string;
	email: string;
	password: string;
	shop: any;
	role: string;
}) => {
	const user = new User({
		name,
		email,
		shop,
		password,
		role,
		isActive: true,
	});

	return await user.save();
};

export default shopRegisterController;
