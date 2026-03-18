module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  modulePaths: ['<rootDir>/client/node_modules'],
  collectCoverageFrom: [
    'backend/**/*.js',
    '!backend/config/**',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 30000,
  maxWorkers: 1, // Run tests serially for API tests
  setupFilesAfterEnv: [],
};
