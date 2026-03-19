"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv_1 = require("dotenv");
var bcryptjs_1 = require("bcryptjs");
var client_1 = require("@prisma/client");
var permissions_1 = require("../src/shared/constants/permissions");
dotenv_1.default.config();
var prisma = new client_1.PrismaClient();
function requiredEnv(name, fallback) {
    var value = process.env[name];
    if (!value || !value.trim()) {
        return fallback;
    }
    return value.trim();
}
function optionalEnv(name) {
    var value = process.env[name];
    if (!value || !value.trim()) {
        return undefined;
    }
    return value.trim();
}
function parseCompanySize(input) {
    var normalized = input.trim().toUpperCase();
    switch (normalized) {
        case client_1.CompanySize.STARTUP:
            return client_1.CompanySize.STARTUP;
        case client_1.CompanySize.SMALL:
            return client_1.CompanySize.SMALL;
        case client_1.CompanySize.MEDIUM:
            return client_1.CompanySize.MEDIUM;
        case client_1.CompanySize.LARGE:
            return client_1.CompanySize.LARGE;
        case client_1.CompanySize.ENTERPRISE:
            return client_1.CompanySize.ENTERPRISE;
        default:
            throw new Error("Invalid SEED_COMPANY_SIZE \"".concat(input, "\". Allowed values: STARTUP, SMALL, MEDIUM, LARGE, ENTERPRISE."));
    }
}
function buildSeedConfig() {
    var website = optionalEnv('SEED_COMPANY_WEBSITE');
    var gstNumber = optionalEnv('SEED_COMPANY_GST');
    var adminPhone = optionalEnv('SEED_ADMIN_PHONE');
    var superAdminPhone = optionalEnv('SEED_SUPER_ADMIN_PHONE');
    var seedSchemaName = optionalEnv('SEED_SCHEMA_NAME');
    return __assign(__assign(__assign(__assign(__assign(__assign(__assign({ companyName: requiredEnv('SEED_COMPANY_NAME', 'Acme Manufacturing Pvt Ltd'), industry: requiredEnv('SEED_COMPANY_INDUSTRY', 'Manufacturing'), companySize: parseCompanySize(requiredEnv('SEED_COMPANY_SIZE', client_1.CompanySize.SMALL)) }, (website ? { website: website } : {})), (gstNumber ? { gstNumber: gstNumber } : {})), { adminEmail: requiredEnv('SEED_ADMIN_EMAIL', 'admin@acme.local'), adminPassword: requiredEnv('SEED_ADMIN_PASSWORD', 'Admin@12345'), adminFirstName: requiredEnv('SEED_ADMIN_FIRST_NAME', 'Company'), adminLastName: requiredEnv('SEED_ADMIN_LAST_NAME', 'Admin') }), (adminPhone ? { adminPhone: adminPhone } : {})), { superAdminEmail: requiredEnv('SEED_SUPER_ADMIN_EMAIL', 'superadmin@avyerp.local'), superAdminPassword: requiredEnv('SEED_SUPER_ADMIN_PASSWORD', 'SuperAdmin@12345'), superAdminFirstName: requiredEnv('SEED_SUPER_ADMIN_FIRST_NAME', 'Platform'), superAdminLastName: requiredEnv('SEED_SUPER_ADMIN_LAST_NAME', 'Admin') }), (superAdminPhone ? { superAdminPhone: superAdminPhone } : {})), (seedSchemaName ? { seedSchemaName: seedSchemaName } : {}));
}
function safeSchemaName(source) {
    return source
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 50);
}
function upsertCompany(config) {
    return __awaiter(this, void 0, void 0, function () {
        var data, existingByGst, existingByName;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    data = {
                        name: config.companyName,
                        industry: config.industry,
                        size: config.companySize,
                        website: (_a = config.website) !== null && _a !== void 0 ? _a : null,
                        gstNumber: (_b = config.gstNumber) !== null && _b !== void 0 ? _b : null,
                        address: {
                            line1: 'Industrial Area',
                            city: 'Pune',
                            state: 'Maharashtra',
                            country: 'India',
                            pincode: '411001',
                        },
                        contactPerson: {
                            name: "".concat(config.adminFirstName, " ").concat(config.adminLastName),
                            email: config.adminEmail,
                            phone: (_c = config.adminPhone) !== null && _c !== void 0 ? _c : '',
                        },
                    };
                    if (!config.gstNumber) return [3 /*break*/, 2];
                    return [4 /*yield*/, prisma.company.findUnique({
                            where: { gstNumber: config.gstNumber },
                        })];
                case 1:
                    existingByGst = _d.sent();
                    if (existingByGst) {
                        return [2 /*return*/, prisma.company.update({
                                where: { id: existingByGst.id },
                                data: data,
                            })];
                    }
                    _d.label = 2;
                case 2: return [4 /*yield*/, prisma.company.findFirst({
                        where: { name: config.companyName },
                    })];
                case 3:
                    existingByName = _d.sent();
                    if (existingByName) {
                        return [2 /*return*/, prisma.company.update({
                                where: { id: existingByName.id },
                                data: data,
                            })];
                    }
                    return [2 /*return*/, prisma.company.create({ data: data })];
            }
        });
    });
}
function upsertTenant(companyId, config) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, defaultSchemaName, schemaName;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, prisma.tenant.findUnique({
                        where: { companyId: companyId },
                    })];
                case 1:
                    existing = _c.sent();
                    defaultSchemaName = "tenant_".concat(safeSchemaName(config.companyName) || 'default');
                    schemaName = (_b = (_a = config.seedSchemaName) !== null && _a !== void 0 ? _a : existing === null || existing === void 0 ? void 0 : existing.schemaName) !== null && _b !== void 0 ? _b : defaultSchemaName;
                    if (existing) {
                        return [2 /*return*/, prisma.tenant.update({
                                where: { id: existing.id },
                                data: {
                                    schemaName: schemaName,
                                    status: client_1.TenantStatus.ACTIVE,
                                },
                            })];
                    }
                    return [2 /*return*/, prisma.tenant.create({
                            data: {
                                companyId: companyId,
                                schemaName: schemaName,
                                status: client_1.TenantStatus.ACTIVE,
                            },
                        })];
            }
        });
    });
}
function upsertUser(params) {
    return __awaiter(this, void 0, void 0, function () {
        var hashedPassword;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, bcryptjs_1.default.hash(params.password, 12)];
                case 1:
                    hashedPassword = _d.sent();
                    return [2 /*return*/, prisma.user.upsert({
                            where: { email: params.email },
                            update: {
                                password: hashedPassword,
                                firstName: params.firstName,
                                lastName: params.lastName,
                                phone: (_a = params.phone) !== null && _a !== void 0 ? _a : null,
                                role: params.role,
                                companyId: (_b = params.companyId) !== null && _b !== void 0 ? _b : null,
                                isActive: true,
                            },
                            create: __assign(__assign({ email: params.email, password: hashedPassword, firstName: params.firstName, lastName: params.lastName, phone: (_c = params.phone) !== null && _c !== void 0 ? _c : null, role: params.role }, (params.companyId ? { companyId: params.companyId } : {})), { isActive: true }),
                        })];
            }
        });
    });
}
function upsertSubscription(tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, prisma.subscription.upsert({
                    where: { tenantId: tenantId },
                    update: {
                        planId: 'trial',
                        userTier: client_1.UserTier.STARTER,
                        billingCycle: client_1.BillingCycle.MONTHLY,
                        modules: {
                            hr: true,
                            production: true,
                            inventory: true,
                            sales: true,
                            finance: true,
                            maintenance: true,
                            visitor: true,
                        },
                        status: client_1.SubscriptionStatus.TRIAL,
                        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                    },
                    create: {
                        tenantId: tenantId,
                        planId: 'trial',
                        userTier: client_1.UserTier.STARTER,
                        billingCycle: client_1.BillingCycle.MONTHLY,
                        modules: {
                            hr: true,
                            production: true,
                            inventory: true,
                            sales: true,
                            finance: true,
                            maintenance: true,
                            visitor: true,
                        },
                        status: client_1.SubscriptionStatus.TRIAL,
                        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                    },
                })];
        });
    });
}
function upsertReferenceRoles(tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var roleRecords;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.all(Object.entries(permissions_1.REFERENCE_ROLE_PERMISSIONS).map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                        var roleName = _b[0], roleConfig = _b[1];
                        return __generator(this, function (_c) {
                            return [2 /*return*/, prisma.role.upsert({
                                    where: {
                                        tenantId_name: {
                                            tenantId: tenantId,
                                            name: roleName,
                                        },
                                    },
                                    update: {
                                        description: roleConfig.description,
                                        permissions: roleConfig.permissions,
                                        isSystem: true,
                                        isActive: true,
                                    },
                                    create: {
                                        tenantId: tenantId,
                                        name: roleName,
                                        description: roleConfig.description,
                                        permissions: roleConfig.permissions,
                                        isSystem: true,
                                        isActive: true,
                                    },
                                })];
                        });
                    }); }))];
                case 1:
                    roleRecords = _a.sent();
                    return [2 /*return*/, roleRecords];
            }
        });
    });
}
function upsertTenantUser(userId, tenantId, roleId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, prisma.tenantUser.upsert({
                    where: {
                        userId_tenantId: {
                            userId: userId,
                            tenantId: tenantId,
                        },
                    },
                    update: {
                        roleId: roleId,
                        isActive: true,
                    },
                    create: {
                        userId: userId,
                        tenantId: tenantId,
                        roleId: roleId,
                        isActive: true,
                    },
                })];
        });
    });
}
function upsertFeatureToggles(userId, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var featureList;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    featureList = ['hr', 'production', 'inventory', 'sales', 'finance', 'maintenance', 'visitor'];
                    return [4 /*yield*/, Promise.all(featureList.map(function (feature) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, prisma.featureToggle.upsert({
                                        where: {
                                            tenantId_userId_feature: {
                                                tenantId: tenantId,
                                                userId: userId,
                                                feature: feature,
                                            },
                                        },
                                        update: {
                                            enabled: true,
                                        },
                                        create: {
                                            tenantId: tenantId,
                                            userId: userId,
                                            feature: feature,
                                            enabled: true,
                                        },
                                    })];
                            });
                        }); }))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function upsertAuditLogEntries(tenantId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma.auditLog.findFirst({
                        where: {
                            tenantId: tenantId,
                            userId: userId,
                            action: 'SEED_BOOTSTRAP',
                        },
                    })];
                case 1:
                    existing = _a.sent();
                    if (existing) {
                        return [2 /*return*/, existing];
                    }
                    return [2 /*return*/, prisma.auditLog.create({
                            data: {
                                tenantId: tenantId,
                                userId: userId,
                                action: 'SEED_BOOTSTRAP',
                                entityType: 'SYSTEM',
                                entityId: 'seed',
                                newValues: {
                                    seededAt: new Date().toISOString(),
                                    note: 'Initial platform seed data created.',
                                },
                                ipAddress: '127.0.0.1',
                                userAgent: 'prisma-seed-script',
                            },
                        })];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var config, company, tenant, companyAdmin, superAdmin, roles, defaultCompanyAdminRole;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    config = buildSeedConfig();
                    console.log('🌱 Starting Avy ERP seed...');
                    return [4 /*yield*/, upsertCompany(config)];
                case 1:
                    company = _b.sent();
                    return [4 /*yield*/, upsertTenant(company.id, config)];
                case 2:
                    tenant = _b.sent();
                    return [4 /*yield*/, upsertUser(__assign(__assign({ email: config.adminEmail, password: config.adminPassword, firstName: config.adminFirstName, lastName: config.adminLastName }, (config.adminPhone ? { phone: config.adminPhone } : {})), { role: client_1.UserRole.COMPANY_ADMIN, companyId: company.id }))];
                case 3:
                    companyAdmin = _b.sent();
                    return [4 /*yield*/, upsertUser(__assign(__assign({ email: config.superAdminEmail, password: config.superAdminPassword, firstName: config.superAdminFirstName, lastName: config.superAdminLastName }, (config.superAdminPhone ? { phone: config.superAdminPhone } : {})), { role: client_1.UserRole.SUPER_ADMIN }))];
                case 4:
                    superAdmin = _b.sent();
                    return [4 /*yield*/, upsertSubscription(tenant.id)];
                case 5:
                    _b.sent();
                    return [4 /*yield*/, upsertReferenceRoles(tenant.id)];
                case 6:
                    roles = _b.sent();
                    defaultCompanyAdminRole = (_a = roles.find(function (role) { return role.name === 'General Manager'; })) !== null && _a !== void 0 ? _a : roles[0];
                    if (!defaultCompanyAdminRole) {
                        throw new Error('No tenant role found after seeding reference roles.');
                    }
                    return [4 /*yield*/, upsertTenantUser(companyAdmin.id, tenant.id, defaultCompanyAdminRole.id)];
                case 7:
                    _b.sent();
                    return [4 /*yield*/, upsertFeatureToggles(companyAdmin.id, tenant.id)];
                case 8:
                    _b.sent();
                    return [4 /*yield*/, upsertAuditLogEntries(tenant.id, companyAdmin.id)];
                case 9:
                    _b.sent();
                    console.log('✅ Seed completed successfully');
                    console.log("   Company: ".concat(company.name, " (").concat(company.id, ")"));
                    console.log("   Tenant: ".concat(tenant.schemaName, " (").concat(tenant.id, ")"));
                    console.log("   Company Admin: ".concat(companyAdmin.email));
                    console.log("   Super Admin: ".concat(superAdmin.email));
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (error) {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
