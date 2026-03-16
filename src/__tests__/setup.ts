/**
 * Global Jest setup file — runs before every test file.
 *
 * Sets all environment variables required by src/config/env.ts so the Zod schema
 * validation does not throw during import.  Real external services (Prisma, Redis,
 * nodemailer) are mocked at the module level inside each test file.
 */

// Prevent ts-jest from loading the real dotenv values
process.env['NODE_ENV'] = 'test';

// Database (required by Zod schema — values are fake; Prisma is always mocked)
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test_db';
process.env['DATABASE_URL_TEMPLATE'] = 'postgresql://test:test@localhost:5432/test_{schema}';

// Redis (required — Redis is always mocked)
process.env['REDIS_URL'] = 'redis://localhost:6379';

// JWT (short secrets only needed for tests — real signing happens in service tests)
process.env['JWT_SECRET'] = 'test-jwt-secret-for-unit-tests-only-32chars!!';
process.env['JWT_REFRESH_SECRET'] = 'test-jwt-refresh-secret-for-unit-tests!!';
process.env['JWT_EXPIRES_IN'] = '15m';
process.env['JWT_REFRESH_EXPIRES_IN'] = '7d';
process.env['JWT_COOKIE_NAME'] = 'avy_erp_token';

// Email (optional — set to empty so code falls back to Ethereal; nodemailer is mocked)
process.env['SMTP_HOST'] = '';
process.env['SMTP_USER'] = '';
process.env['SMTP_PASS'] = '';
process.env['FROM_EMAIL'] = 'noreply@avyerp.com';
process.env['FROM_NAME'] = 'Avy ERP';
process.env['APP_NAME'] = 'Avy ERP';
process.env['APP_URL'] = 'http://localhost:3000';

// Misc defaults
process.env['BCRYPT_ROUNDS'] = '1'; // Use 1 round in tests for speed
process.env['LOG_LEVEL'] = 'error'; // Suppress info/debug logs during tests
process.env['STORAGE_TYPE'] = 'local';
process.env['ENABLE_SWAGGER'] = 'false';
process.env['ENABLE_CORS'] = 'true';
