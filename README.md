# Avy ERP Backend

A multi-tenant SaaS ERP platform backend built with Node.js, Express.js, TypeScript, and PostgreSQL.

## 🚀 Features

- **Multi-tenant Architecture**: Schema-per-tenant isolation
- **Modular Monolith**: Clean module boundaries with microservice-like organization
- **RBAC**: Role-Based Access Control with feature toggles
- **Offline-First**: Mobile app support with sync capabilities
- **Queue Workers**: Background job processing for reports and notifications
- **Analytics & Reporting**: Real-time dashboards and scheduled reports

## 🏗️ Architecture

```
avy-erp-backend/
├── src/
│   ├── app/                 # Application setup
│   ├── config/             # Configuration files
│   ├── core/               # Platform-level modules
│   │   ├── auth/          # Authentication & JWT
│   │   ├── tenant/        # Multi-tenant management
│   │   ├── rbac/          # Role-based access control
│   │   ├── company/       # Company management
│   │   ├── billing/       # Subscription & billing
│   │   └── feature-toggle/# User-level feature control
│   ├── modules/            # Business modules
│   │   ├── hr/            # Human resources
│   │   ├── production/    # Manufacturing operations
│   │   ├── inventory/     # Stock management
│   │   ├── maintenance/   # Equipment maintenance
│   │   ├── visitors/      # Visitor management
│   │   ├── machines/      # Machine management
│   │   └── reports/       # Reporting system
│   ├── platform/           # Cross-cutting services
│   │   ├── notifications/ # Email, SMS, push notifications
│   │   ├── analytics/     # Data analytics
│   │   ├── integrations/  # External system integrations
│   │   └── audit/         # Audit logging
│   ├── infrastructure/     # Technical infrastructure
│   │   ├── database/      # Database utilities
│   │   ├── queue/         # Queue management
│   │   ├── cache/         # Redis caching
│   │   └── storage/       # File storage
│   ├── middleware/         # Express middleware
│   ├── workers/           # Background job workers
│   ├── shared/            # Shared utilities & types
│   └── tests/             # Test files
```

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Queue**: Bull (Redis-based)
- **Authentication**: JWT
- **Validation**: Joi & Zod
- **Logging**: Winston

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- npm or yarn

## 🚀 Quick Start

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd avy-erp-backend
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Set up the database:**
   ```bash
   # Generate Prisma client
   npm run db:generate

   # Run database migrations
   npm run db:push

   # (Optional) Seed the database
   npm run db:seed
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Start background workers (in separate terminals):**
   ```bash
   npm run worker:reports
   npm run worker:analytics
   npm run worker:notifications
   ```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection URL | Required |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret | Required |
| `SMTP_HOST` | Email SMTP host | Optional |

See `.env` file for complete configuration options.

## 📡 API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `GET /api/v1/auth/profile` - Get user profile

### Multi-tenant Management (Super-admin only)
- `GET /api/v1/platform/tenants` - List all tenants
- `POST /api/v1/platform/tenants` - Create new tenant
- `GET /api/v1/platform/tenants/:id` - Get tenant details

### Business Modules
- `/api/v1/hr/*` - Human Resources
- `/api/v1/production/*` - Production Management
- `/api/v1/inventory/*` - Inventory Management
- `/api/v1/maintenance/*` - Equipment Maintenance
- `/api/v1/reports/*` - Reports & Analytics

## 🔐 Multi-tenancy

Avy ERP uses a **schema-per-tenant** architecture:

- Each tenant has a dedicated PostgreSQL schema
- Complete data isolation between tenants
- Shared platform services (auth, billing, etc.)
- Automatic tenant provisioning on signup

### Tenant Context

Requests include tenant context via:
- Header: `X-Tenant-ID`
- Subdomain: `tenant1.avyerp.com`
- Query parameter: `?tenantId=...`

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## 📊 Monitoring

### Health Checks
- `GET /health` - Application health status

### Logs
- Application logs: `./logs/app.log`
- Error logs: `./logs/app-error.log`

### Metrics
- Queue statistics via Redis
- Database connection pooling metrics
- Request/response metrics via middleware

## 🚢 Deployment

### Production Build
```bash
npm run build
npm start
```

### Docker
```bash
docker build -t avy-erp-backend .
docker run -p 3000:3000 avy-erp-backend
```

### Environment Setup
1. Set `NODE_ENV=production`
2. Configure production database and Redis
3. Set secure JWT secrets
4. Configure SMTP for email notifications
5. Set up file storage (S3 recommended)

## 🔄 Background Workers

### Report Worker
Processes large report generation jobs:
```bash
npm run worker:reports
```

### Analytics Worker
Handles data aggregation and analytics:
```bash
npm run worker:analytics
```

### Notification Worker
Manages email, SMS, and push notifications:
```bash
npm run worker:notifications
```

## 📁 Project Structure Details

### Core Modules
- **auth**: JWT authentication, login/logout, password management
- **tenant**: Tenant provisioning, schema management, routing
- **rbac**: Role and permission management
- **company**: Company profile and settings
- **billing**: Subscription management and invoicing
- **feature-toggle**: User-level feature control

### Business Modules
Each module is self-contained with:
- Controllers (API endpoints)
- Services (business logic)
- Repositories (data access)
- Routes (URL routing)
- Types (TypeScript interfaces)
- Validators (input validation)

### Infrastructure
- **database**: Connection management, migrations, health checks
- **queue**: Job queuing and processing
- **cache**: Redis caching layer
- **storage**: File upload and cloud storage

## 🤝 Contributing

1. Follow the established folder structure
2. Use function-based programming (no classes)
3. Write comprehensive tests
4. Update documentation
5. Follow TypeScript strict mode

## 📝 License

This project is proprietary software owned by Avyren Technologies.

## 🆘 Support

For support, contact the development team at Avyren Technologies.