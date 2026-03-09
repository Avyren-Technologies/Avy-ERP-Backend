.
├── README.md
├── package-lock.json
├── package.json
├── prisma
│   └── schema.prisma
├── project-structure.md
├── src
│   ├── app
│   │   ├── app.ts
│   │   ├── routes.ts
│   │   └── server.ts
│   ├── config
│   │   ├── database.ts
│   │   ├── env.ts
│   │   ├── logger.ts
│   │   └── redis.ts
│   ├── core
│   │   ├── auth
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.types.ts
│   │   ├── billing
│   │   │   └── billing.routes.ts
│   │   ├── company
│   │   │   └── company.routes.ts
│   │   ├── feature-toggle
│   │   │   └── feature-toggle.routes.ts
│   │   ├── rbac
│   │   │   └── rbac.routes.ts
│   │   └── tenant
│   │       ├── tenant.controller.ts
│   │       ├── tenant.routes.ts
│   │       └── tenant.service.ts
│   ├── infrastructure
│   │   ├── cache
│   │   │   └── cache.service.ts
│   │   ├── database
│   │   │   └── connection.ts
│   │   ├── queue
│   │   │   └── report.queue.ts
│   │   └── storage
│   │       └── storage.service.ts
│   ├── middleware
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── logging.middleware.ts
│   │   └── tenant.middleware.ts
│   ├── modules
│   │   ├── hr
│   │   │   └── routes.ts
│   │   ├── inventory
│   │   │   └── routes.ts
│   │   ├── machines
│   │   │   └── routes.ts
│   │   ├── maintenance
│   │   │   └── routes.ts
│   │   ├── production
│   │   │   └── routes.ts
│   │   ├── reports
│   │   │   └── routes.ts
│   │   └── visitors
│   │       └── routes.ts
│   ├── shared
│   │   ├── constants
│   │   │   └── index.ts
│   │   ├── errors
│   │   │   ├── api-error.ts
│   │   │   ├── auth-error.ts
│   │   │   ├── index.ts
│   │   │   └── validation-error.ts
│   │   ├── types
│   │   │   └── index.ts
│   │   ├── utils
│   │   │   └── index.ts
│   │   └── validators
│   │       └── index.ts
│   └── workers
│       ├── analytics.worker.ts
│       ├── notification.worker.ts
│       └── report.worker.ts
└── tsconfig.json

33 directories, 50 files
