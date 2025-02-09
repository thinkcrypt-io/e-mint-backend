const generateTextContent = (content: string, str?: string) => {
	if (content && content.trim().length > 0) {
		return content;
	} else {
		if (str) return str;
		else return 'Enter your text here';
	}
};

export default generateTextContent;
