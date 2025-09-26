import { NextFunction, Request, Response } from 'express';
import { Schema } from 'joi';

const validate = (validator: Schema) => {
	return (req: Request, res: Response, next: NextFunction): Response | void => {
		const { error } = validator.validate(req.body);
		if (error) return res.status(400).send({ message: error.details[0].message });
		next();
	};
};

export default validate;
