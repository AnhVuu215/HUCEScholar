module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ['**/*.integration.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 20000,
};
