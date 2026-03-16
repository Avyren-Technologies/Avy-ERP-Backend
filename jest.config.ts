import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // Relax strict settings that cause issues in test files
          strict: false,
          noImplicitAny: false,
          strictNullChecks: false,
          noImplicitReturns: false,
          noFallthroughCasesInSwitch: false,
          noUncheckedIndexedAccess: false,
          exactOptionalPropertyTypes: false,
        },
      },
    ],
  },
  moduleNameMapper: {
    // Map TypeScript path aliases to actual paths
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@/core/(.*)$': '<rootDir>/src/core/$1',
    '^@/modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@/infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@/middleware/(.*)$': '<rootDir>/src/middleware/$1',
  },
  // Prevent test runner from using production env vars — set the minimum required vars here
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  // Collect coverage from source files (exclude tests, migrations, workers)
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
    '!src/app/server.ts',
    '!src/workers/**',
    '!src/prisma/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Increase timeout for integration tests that do async work
  testTimeout: 15000,
  // Clear mocks between each test automatically
  clearMocks: true,
  restoreMocks: true,
};

export default config;
