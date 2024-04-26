import Leave from '../../models/leave/leave.model.js';

type LeaveConditionsType = {
	startDate: Date;
	endDate: Date;
	leaveType: string;
	ip: any;
	days: number;
	id: string;
};

const generateResponse = (status: string, subject: string, reasonOfRejection: string) => {
	return {
		status,
		subject,
		reasonOfRejection,
	};
};

const leaveConditions = async ({
	id,
	startDate,
	endDate,
	leaveType,
	ip,
	days,
}: LeaveConditionsType): Promise<any> => {
	const now = new Date();
	const time = now.getHours();

	if (leaveType === 'sick' && time > 11) {
		return generateResponse(
			'rejected',
			'Leave Request Rejected',
			'Sick Leave Applications not allowed after 11AM'
		);
	}

	if (leaveType === 'casual') {
		if (ip != '45.248.149.63') {
			return generateResponse(
				'rejected',
				'Leave Request Rejected',
				'Casual Leave Applications must be made from within office premises'
			);
		}

		if (time > 18) {
			return generateResponse(
				'rejected',
				'Leave Request Rejected',
				'Casual Leave Applications not allowed after 6PM'
			);
		}

		const start = new Date(startDate);
		if (start <= now) {
			return generateResponse(
				'rejected',
				'Leave Request Rejected',
				'Casual Leave Applications must be made before the start date'
			);
		}

		const daysPrior = days <= 2 ? 2 : 3;
		const requiredPriorDate = new Date();
		requiredPriorDate.setDate(now.getDate() - daysPrior);

		if (start < requiredPriorDate) {
			return generateResponse(
				'rejected',
				'Leave Request Rejected',
				`For ${days} days of casual leave, application should be made ${daysPrior} days prior`
			);
		}
	}

	try {
		const overlappingLeave = await Leave.findOne({
			employee: id,
			$or: [
				{ startDate: { $gte: startDate, $lte: endDate } },
				{ endDate: { $gte: startDate, $lte: endDate } },
			],
		});

		if (overlappingLeave) {
			return generateResponse('rejected', 'Leave Request Rejected', 'Overlapping Leave Request');
		} else {
			return generateResponse('pending', 'Leave Request Pending', '');
		}
	} catch (e) {
		console.log(e);
		return generateResponse(
			'rejected',
			'There was an error processing the data',
			'There was an error processing the data'
		);
	}
};

export default leaveConditions;
