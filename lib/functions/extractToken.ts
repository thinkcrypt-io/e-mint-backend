const extractToken = (authHeader: string | undefined): string | null => {
	if (!authHeader || !authHeader.startsWith('Bearer')) {
		return null;
	}
	return authHeader.split(' ')[1];
};

export default extractToken;
