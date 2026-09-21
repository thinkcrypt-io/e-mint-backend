module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',

	// The source is ESM, so relative imports carry a `.js` extension that points
	// at the compiled output — which ts-jest, resolving the `.ts` sources, cannot
	// find. Strip the extension so `../configVars.js` resolves to the `.ts` next
	// to it. Without this, every suite in this repo fails to even load.
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},

	// `npx tsc` emits a copy of each test into dist/, which jest then picks up as
	// a second, plain-CommonJS copy of the same suite and fails to parse.
	testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
