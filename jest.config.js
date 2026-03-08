/** @type {import('jest').Config} */
export default {
  testEnvironment: 'allure-jest/node',
  testEnvironmentOptions: {
    resultsDir: 'allure-results/unit',
  },
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  transform: {},
  reporters: ['default'],
  testTimeout: 10000,
};
