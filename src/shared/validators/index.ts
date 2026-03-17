import { z } from 'zod';
import { ValidationError } from '../errors';

const gstNumberPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/;
const phonePattern = /^\+?[\d\s\-\(\)]{10,}$/;
const resetCodePattern = /^\d{6}$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

const trimString = (value: unknown) => (typeof value === 'string' ? value.trim() : value);

const toNumber = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? Number.NaN : Number(trimmed);
};

const toBoolean = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }

  return value;
};

const isIsoDate = (value: string) => isoDatePattern.test(value) && !Number.isNaN(Date.parse(value));

const toDate = (value: unknown) => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return isIsoDate(trimmed) ? new Date(trimmed) : new Date(Number.NaN);
  }

  return value;
};

const numberSchema = (schema: z.ZodNumber) => z.preprocess(toNumber, schema);
const dateValueSchema = z.preprocess(toDate, z.date());
const flexibleObjectSchema = z.record(z.unknown());

const atLeastOneField = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

const requiredString = (message: string) =>
  z.string({
    required_error: message,
    invalid_type_error: message,
  });

// Common validation schemas
export const idSchema = z.string().uuid();

export const emailSchema = requiredString('Email is required')
  .trim()
  .toLowerCase()
  .email('Please provide a valid email address');

export const passwordSchema = requiredString('Password is required')
  .min(8, 'Password must be at least 8 characters long')
  .regex(
    passwordPattern,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  );

export const phoneSchema = requiredString('Phone number is required')
  .regex(phonePattern, 'Please provide a valid phone number');

export const nameSchema = requiredString('Name is required')
  .trim()
  .min(2, 'Name must be at least 2 characters long')
  .max(100, 'Name cannot exceed 100 characters');

export const paginationSchema = z.object({
  page: numberSchema(z.number().int().min(1)).default(1),
  limit: numberSchema(z.number().int().min(1).max(100)).default(25),
  search: z.preprocess(trimString, z.string()).optional(),
  sortBy: z.preprocess(trimString, z.string()).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dateSchema = dateValueSchema;

export const booleanSchema = z.preprocess(toBoolean, z.boolean());

// Authentication schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: requiredString('Password is required'),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  companyName: nameSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: requiredString('Refresh token is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: passwordSchema,
});

// User management schemas
export const createUserSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema.optional(),
  roleId: idSchema,
  department: z.preprocess(trimString, z.string().max(100)).optional(),
  designation: z.preprocess(trimString, z.string().max(100)).optional(),
  isActive: booleanSchema.default(true),
});

export const updateUserSchema = atLeastOneField({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: phoneSchema.optional(),
  roleId: idSchema.optional(),
  department: z.preprocess(trimString, z.string().max(100)).optional(),
  designation: z.preprocess(trimString, z.string().max(100)).optional(),
  isActive: booleanSchema.optional(),
});

export const userFiltersSchema = paginationSchema.extend({
  roleId: idSchema.optional(),
  department: z.preprocess(trimString, z.string()).optional(),
  isActive: booleanSchema.optional(),
  searchFields: z.array(z.string()).default(['firstName', 'lastName', 'email']),
});

// Role management schemas
export const createRoleSchema = z.object({
  name: z.preprocess(trimString, z.string().min(2).max(50)),
  description: z.preprocess(trimString, z.string().max(500)).optional(),
  permissions: z.array(z.string()),
  isActive: booleanSchema.default(true),
});

export const updateRoleSchema = atLeastOneField({
  name: z.preprocess(trimString, z.string().min(2).max(50)).optional(),
  description: z.preprocess(trimString, z.string().max(500)).optional(),
  permissions: z.array(z.string()).optional(),
  isActive: booleanSchema.optional(),
});

// Company schemas
export const createCompanySchema = z.object({
  name: nameSchema,
  industry: z.preprocess(trimString, z.string().max(100)),
  size: z.enum(['startup', 'small', 'medium', 'large', 'enterprise']),
  website: z.preprocess(trimString, z.string().url()).optional(),
  address: z.object({
    street: z.preprocess(trimString, z.string()),
    city: z.preprocess(trimString, z.string()),
    state: z.preprocess(trimString, z.string()),
    country: z.preprocess(trimString, z.string()),
    pincode: z.preprocess(trimString, z.string()),
  }),
  gstNumber: z.preprocess(trimString, z.string().regex(gstNumberPattern)).optional(),
  contactPerson: z.object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
  }),
});

export const updateCompanySchema = atLeastOneField({
  name: nameSchema.optional(),
  industry: z.preprocess(trimString, z.string().max(100)).optional(),
  size: z.enum(['startup', 'small', 'medium', 'large', 'enterprise']).optional(),
  website: z.preprocess(trimString, z.string().url()).optional(),
  address: z.object({
    street: z.preprocess(trimString, z.string()).optional(),
    city: z.preprocess(trimString, z.string()).optional(),
    state: z.preprocess(trimString, z.string()).optional(),
    country: z.preprocess(trimString, z.string()).optional(),
    pincode: z.preprocess(trimString, z.string()).optional(),
  }).optional(),
  gstNumber: z.preprocess(trimString, z.string().regex(gstNumberPattern)).optional(),
  contactPerson: z.object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  }).optional(),
});

// Module schemas
export const moduleConfigSchema = z.object({
  moduleId: z.string(),
  isEnabled: booleanSchema.default(true),
  config: flexibleObjectSchema.optional(),
  features: z.array(z.string()).optional(),
});

// Billing schemas
export const subscriptionSchema = z.object({
  planId: idSchema,
  userTier: z.enum(['starter', 'growth', 'scale', 'enterprise', 'custom']),
  billingCycle: z.enum(['monthly', 'annual']),
  modules: z.array(
    z.object({
      moduleId: z.string(),
      customPrice: numberSchema(z.number().min(0)).optional(),
    })
  ),
});

// Production schemas
export const productionLogSchema = z.object({
  shiftId: idSchema,
  employeeId: idSchema,
  partId: idSchema,
  operationId: idSchema,
  machineId: idSchema,
  quantity: numberSchema(z.number().int().min(1)),
  startTime: dateSchema,
  endTime: dateSchema.optional(),
  scrapQuantity: numberSchema(z.number().int().min(0)).default(0),
  ncQuantity: numberSchema(z.number().int().min(0)).default(0),
  remarks: z.preprocess(trimString, z.string().max(500)).optional(),
});

export const oeeCalculationSchema = z.object({
  machineId: idSchema,
  date: dateSchema,
  shiftId: idSchema,
  plannedProductionTime: numberSchema(z.number().min(0)),
  downtime: numberSchema(z.number().min(0)).default(0),
  idealCycleTime: numberSchema(z.number().min(0)),
  totalCount: numberSchema(z.number().int().min(0)),
  goodCount: numberSchema(z.number().int().min(0)),
});

// Inventory schemas
export const itemSchema = z.object({
  code: z.preprocess(trimString, z.string().max(50)),
  name: z.preprocess(trimString, z.string().max(200)),
  description: z.preprocess(trimString, z.string().max(1000)).optional(),
  category: z.preprocess(trimString, z.string().max(100)),
  unit: z.preprocess(trimString, z.string().max(20)),
  hsnCode: z.preprocess(trimString, z.string().max(10)).optional(),
  gstRate: numberSchema(z.number().min(0).max(1)).optional(),
  reorderPoint: numberSchema(z.number().min(0)),
  maxStock: numberSchema(z.number().min(0)).optional(),
  isActive: booleanSchema.default(true),
});

export const stockMovementSchema = z.object({
  itemId: idSchema,
  type: z.enum(['receipt', 'issue', 'adjustment']),
  quantity: numberSchema(z.number().min(0)),
  referenceType: z.enum(['po', 'so', 'manual', 'production']),
  referenceId: z.string().optional(),
  warehouseId: idSchema,
  remarks: z.preprocess(trimString, z.string().max(500)).optional(),
});

// HR schemas
export const employeeSchema = z.object({
  employeeId: z.preprocess(trimString, z.string().max(20)),
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  department: z.preprocess(trimString, z.string().max(100)),
  designation: z.preprocess(trimString, z.string().max(100)),
  dateOfJoining: dateSchema,
  dateOfBirth: dateSchema.optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  address: z.object({
    street: z.preprocess(trimString, z.string()).optional(),
    city: z.preprocess(trimString, z.string()).optional(),
    state: z.preprocess(trimString, z.string()).optional(),
    pincode: z.preprocess(trimString, z.string()).optional(),
  }).optional(),
  salary: numberSchema(z.number().min(0)).optional(),
  isActive: booleanSchema.default(true),
});

export const leaveRequestSchema = z.object({
  leaveType: z.enum(['casual', 'sick', 'earned', 'maternity', 'paternity']),
  startDate: dateSchema,
  endDate: dateSchema,
  reason: z.preprocess(trimString, z.string().max(500)),
  contactNumber: phoneSchema.optional(),
});

export const attendanceLogSchema = z.object({
  employeeId: idSchema,
  date: dateSchema,
  checkIn: dateSchema.optional(),
  checkOut: dateSchema.optional(),
  breakStart: dateSchema.optional(),
  breakEnd: dateSchema.optional(),
  totalHours: numberSchema(z.number().min(0)).optional(),
  status: z.enum(['present', 'absent', 'half-day', 'late']).optional(),
});

// Maintenance schemas
export const machineSchema = z.object({
  code: z.preprocess(trimString, z.string().max(50)),
  name: z.preprocess(trimString, z.string().max(200)),
  type: z.preprocess(trimString, z.string().max(100)),
  location: z.preprocess(trimString, z.string().max(200)),
  manufacturer: z.preprocess(trimString, z.string().max(100)).optional(),
  model: z.preprocess(trimString, z.string().max(100)).optional(),
  serialNumber: z.preprocess(trimString, z.string().max(100)).optional(),
  installationDate: dateSchema.optional(),
  capacity: flexibleObjectSchema.optional(),
  specifications: flexibleObjectSchema.optional(),
  isActive: booleanSchema.default(true),
});

export const maintenanceScheduleSchema = z.object({
  machineId: idSchema,
  type: z.enum(['preventive', 'predictive', 'condition-based']),
  title: z.preprocess(trimString, z.string().max(200)),
  description: z.preprocess(trimString, z.string().max(1000)).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly']),
  estimatedDuration: numberSchema(z.number().min(0)),
  requiredParts: z.array(
    z.object({
      partId: idSchema,
      quantity: numberSchema(z.number().min(1)),
    })
  ).optional(),
  checklist: z.array(z.string()).optional(),
  isActive: booleanSchema.default(true),
});

export const breakdownReportSchema = z.object({
  machineId: idSchema,
  reportedBy: idSchema,
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.preprocess(trimString, z.string().max(100)),
  description: z.preprocess(trimString, z.string().max(1000)),
  symptoms: z.array(z.string()).optional(),
  possibleCauses: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional(),
});

// Finance schemas
export const invoiceSchema = z.object({
  type: z.enum(['sales', 'purchase']),
  reference: z.preprocess(trimString, z.string().max(50)).optional(),
  customerId: idSchema.optional(),
  vendorId: idSchema.optional(),
  invoiceDate: dateSchema,
  dueDate: dateSchema,
  items: z.array(
    z.object({
      itemId: idSchema.optional(),
      description: z.preprocess(trimString, z.string().max(500)),
      quantity: numberSchema(z.number().min(0)),
      rate: numberSchema(z.number().min(0)),
      discount: numberSchema(z.number().min(0)).default(0),
      gstRate: numberSchema(z.number().min(0).max(1)).optional(),
    })
  ),
  notes: z.preprocess(trimString, z.string().max(1000)).optional(),
});

export const paymentSchema = z.object({
  invoiceId: idSchema,
  amount: numberSchema(z.number().min(0)),
  paymentDate: dateSchema,
  paymentMethod: z.enum(['cash', 'bank-transfer', 'cheque', 'upi', 'card']),
  reference: z.preprocess(trimString, z.string().max(100)).optional(),
  notes: z.preprocess(trimString, z.string().max(500)).optional(),
});

// Visitor schemas
export const visitorRegistrationSchema = z.object({
  name: nameSchema,
  email: emailSchema.optional(),
  phone: phoneSchema,
  company: z.preprocess(trimString, z.string().max(200)).optional(),
  purpose: z.preprocess(trimString, z.string().max(500)),
  hostEmployeeId: idSchema,
  expectedArrival: dateSchema,
  expectedDeparture: dateSchema.optional(),
  idProof: z.string().optional(),
  vehicleNumber: z.preprocess(trimString, z.string().max(20)).optional(),
});

export const visitorCheckInSchema = z.object({
  visitorId: idSchema,
  checkInTime: dateSchema.optional(),
  badgeNumber: z.preprocess(trimString, z.string().max(20)).optional(),
  gate: z.preprocess(trimString, z.string().max(50)).optional(),
});

export const visitorCheckOutSchema = z.object({
  visitorId: idSchema,
  checkOutTime: dateSchema.optional(),
  remarks: z.preprocess(trimString, z.string().max(500)).optional(),
});

// Password reset schemas
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const resetCodeSchema = requiredString('Reset code is required')
  .length(6, 'Reset code must be exactly 6 digits')
  .regex(resetCodePattern, 'Reset code must be exactly 6 digits');

export const verifyResetCodeSchema = z.object({
  email: emailSchema,
  code: resetCodeSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: resetCodeSchema,
  newPassword: passwordSchema,
});

// Validation middleware
export function validate<T extends z.ZodTypeAny>(schema: T) {
  return (data: unknown): z.output<T> => {
    const result = schema.safeParse(data);

    if (!result.success) {
      throw ValidationError.fromZod(result.error);
    }

    return result.data;
  };
}

// Export common validation functions
export const validateLogin = validate(loginSchema);
export const validateRegister = validate(registerSchema);
export const validateRefreshToken = validate(refreshTokenSchema);
export const validateChangePassword = validate(changePasswordSchema);
export const validateCreateUser = validate(createUserSchema);
export const validateUpdateUser = validate(updateUserSchema);
export const validateCreateRole = validate(createRoleSchema);
export const validateUpdateRole = validate(updateRoleSchema);
export const validateCreateCompany = validate(createCompanySchema);
export const validateUpdateCompany = validate(updateCompanySchema);
export const validateForgotPassword = validate(forgotPasswordSchema);
export const validateVerifyResetCode = validate(verifyResetCodeSchema);
export const validateResetPassword = validate(resetPasswordSchema);
