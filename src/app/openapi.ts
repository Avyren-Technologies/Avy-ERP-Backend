import type { Router } from 'express';
import listEndpoints from 'express-list-endpoints';
import { env } from '../config/env';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';

type OpenApiOperation = {
  tags: string[];
  summary: string;
  operationId: string;
  responses: Record<string, { description: string }>;
  security?: Array<Record<'bearerAuth', string[]>>;
};

type OpenApiPathItem = Partial<Record<HttpMethod, OpenApiOperation>>;
type OpenApiPaths = Record<string, OpenApiPathItem>;

const OPENAPI_VERSION = '3.0.3';

const HTTP_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
]);

const PUBLIC_ENDPOINTS: ReadonlySet<string> = new Set([
  '/health',
  '/auth/login',
  '/auth/register',
  '/auth/refresh-token',
  '/auth/forgot-password',
  '/auth/verify-reset-code',
  '/auth/reset-password',
  '/openapi.json',
  '/docs',
]);

function normalizeApiPrefix(prefix: string): string {
  const withLeadingSlash = prefix.startsWith('/') ? prefix : `/${prefix}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

function normalizeRoutePath(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  return withLeadingSlash.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function joinPath(prefix: string, path: string): string {
  const left = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const right = path.startsWith('/') ? path : `/${path}`;
  return `${left}${right}`.replace(/\/{2,}/g, '/');
}

function inferTag(path: string): string {
  const normalized = normalizeRoutePath(path);
  const segment = normalized.split('/').filter(Boolean)[0];

  if (!segment) {
    return 'General';
  }

  if (segment.startsWith('{')) {
    return 'Tenant';
  }

  return segment
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toOperationId(method: string, fullPath: string): string {
  const cleanPath = fullPath
    .replace(/[{}]/g, '')
    .replace(/[^A-Za-z0-9/]/g, '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return `${method.toLowerCase()}${cleanPath || 'Root'}`;
}

function isPublicEndpoint(fullPath: string): boolean {
  for (const publicPath of PUBLIC_ENDPOINTS) {
    if (fullPath.endsWith(publicPath)) {
      return true;
    }
  }
  return false;
}

function responsesFor(method: string, isPublic: boolean): Record<string, { description: string }> {
  const baseResponses: Record<string, { description: string }> = {
    '500': { description: 'Internal Server Error' },
  };

  if (!isPublic) {
    baseResponses['401'] = { description: 'Unauthorized' };
  }

  switch (method) {
    case 'POST':
      return {
        '201': { description: 'Created' },
        '400': { description: 'Bad Request' },
        ...baseResponses,
      };
    case 'DELETE':
      return {
        '204': { description: 'No Content' },
        '400': { description: 'Bad Request' },
        ...baseResponses,
      };
    default:
      return {
        '200': { description: 'Successful response' },
        '400': { description: 'Bad Request' },
        ...baseResponses,
      };
  }
}

export function buildOpenApiSpec(router: Router) {
  const apiPrefix = normalizeApiPrefix(env.API_PREFIX);
  const paths: OpenApiPaths = {};
  const endpoints = listEndpoints(router);

  for (const endpoint of endpoints) {
    const routePath = normalizeRoutePath(endpoint.path);
    const fullPath = joinPath(apiPrefix, routePath);
    const tag = inferTag(routePath);
    const isPublic = isPublicEndpoint(fullPath);

    if (!paths[fullPath]) {
      paths[fullPath] = {};
    }

    for (const method of endpoint.methods) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }

      const operationMethod = method.toLowerCase() as HttpMethod;
      paths[fullPath][operationMethod] = {
        tags: [tag],
        summary: `${method} ${fullPath}`,
        operationId: toOperationId(method, fullPath),
        responses: responsesFor(method, isPublic),
        ...(isPublic ? {} : { security: [{ bearerAuth: [] }] }),
      };
    }
  }

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: `${env.APP_NAME} API`,
      version: '1.0.0',
      description: 'Auto-generated OpenAPI specification for Avy ERP Backend.',
    },
    servers: [
      {
        url: env.APP_URL,
        description: `${env.NODE_ENV} server`,
      },
    ],
    tags: [
      { name: 'General', description: 'General endpoints' },
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Platform', description: 'Platform administration endpoints' },
      { name: 'Rbac', description: 'Role and permission endpoints' },
      { name: 'Feature Toggles', description: 'Feature toggle management endpoints' },
      { name: 'Hr', description: 'Human resources endpoints' },
      { name: 'Production', description: 'Production management endpoints' },
      { name: 'Machines', description: 'Machine module endpoints' },
      { name: 'Inventory', description: 'Inventory module endpoints' },
      { name: 'Visitors', description: 'Visitor management endpoints' },
      { name: 'Maintenance', description: 'Maintenance module endpoints' },
      { name: 'Reports', description: 'Reporting endpoints' },
      { name: 'Tenant', description: 'Tenant-scoped endpoints' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    paths,
  };
}
