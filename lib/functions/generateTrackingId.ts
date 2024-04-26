const generateTrackingId = (length = 4) => {
	const date = new Date();
	const dateString = `${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}`; // YYYYMMDD

	const randomAlphaNumeric = Math.random()
		.toString(36)
		.substring(2, length + 2); // Generate a random 6-digit alphanumeric string

	return dateString + randomAlphaNumeric; // Concatenate the date string and the random alphanumeric string
};

export default generateTrackingId;
