import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

// Silence logs in test output
jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Keep tenant checks out of OpenAPI route tests
jest.mock('../../middleware/tenant.middleware', () => ({
  tenantMiddleware: () => (_req: any, _res: any, next: any) => next(),
  requireTenant: () => (_req: any, _res: any, next: any) => next(),
  validateTenantAccess: (_req: any, _res: any, next: any) => next(),
}));

// Avoid in-memory rate-limit side effects between tests
jest.mock('express-rate-limit', () => () => (_req: any, _res: any, next: any) => next());

async function loadAppWithSwagger(enabled: boolean) {
  process.env['ENABLE_SWAGGER'] = String(enabled);
  let loadedApp: typeof import('../app').app | undefined;
  await jest.isolateModulesAsync(async () => {
    const appModule = await import('../app');
    loadedApp = appModule.app;
  });

  if (!loadedApp) {
    throw new Error('Failed to load app module for test');
  }

  return loadedApp;
}

describe('OpenAPI docs exposure', () => {
  const apiPrefix = process.env['API_PREFIX'] ?? '/api/v1';

  it('serves OpenAPI JSON and Swagger UI when ENABLE_SWAGGER=true', async () => {
    const app = await loadAppWithSwagger(true);

    const openApiRes = await request(app).get(`${apiPrefix}/openapi.json`);
    expect(openApiRes.status).toBe(200);
    expect(openApiRes.body.openapi).toBe('3.0.3');
    expect(openApiRes.body.paths).toBeDefined();
    expect(openApiRes.body.paths[`${apiPrefix}/health`]).toBeDefined();

    const docsRes = await request(app).get(`${apiPrefix}/docs/`);
    expect(docsRes.status).toBe(200);
    expect(docsRes.headers['content-type']).toContain('text/html');
  });

  it('does not expose docs endpoints when ENABLE_SWAGGER=false', async () => {
    const app = await loadAppWithSwagger(false);

    const openApiRes = await request(app).get(`${apiPrefix}/openapi.json`);
    expect(openApiRes.status).toBe(401);

    const docsRes = await request(app).get(`${apiPrefix}/docs/`);
    expect(docsRes.status).toBe(401);
  });
});
