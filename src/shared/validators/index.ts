import Joi from 'joi';
import { ValidationError } from '../errors';

// Common validation schemas
export const idSchema = Joi.string().uuid().required();

export const emailSchema = Joi.string()
  .email()
  .lowercase()
  .trim()
  .required()
  .messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  });

export const passwordSchema = Joi.string()
  .min(8)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    'any.required': 'Password is required',
  });

export const phoneSchema = Joi.string()
  .pattern(/^\+?[\d\s\-\(\)]{10,}$/)
  .required()
  .messages({
    'string.pattern.base': 'Please provide a valid phone number',
    'any.required': 'Phone number is required',
  });

export const nameSchema = Joi.string()
  .trim()
  .min(2)
  .max(100)
  .required()
  .messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name cannot exceed 100 characters',
    'any.required': 'Name is required',
  });

export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow(''),
  sortBy: Joi.string().trim(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const dateSchema = Joi.date().iso();

export const booleanSchema = Joi.boolean();

// Authentication schemas
export const loginSchema = Joi.object({
  email: emailSchema,
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
  }),
});

export const registerSchema = Joi.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  companyName: nameSchema,
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    'any.required': 'Refresh token is required',
  }),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: passwordSchema,
});

// User management schemas
export const createUserSchema = Joi.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema.optional(),
  roleId: idSchema,
  department: Joi.string().trim().max(100).optional(),
  designation: Joi.string().trim().max(100).optional(),
  isActive: booleanSchema.default(true),
});

export const updateUserSchema = Joi.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: phoneSchema.optional(),
  roleId: idSchema.optional(),
  department: Joi.string().trim().max(100).optional(),
  designation: Joi.string().trim().max(100).optional(),
  isActive: booleanSchema.optional(),
}).min(1);

export const userFiltersSchema = paginationSchema.keys({
  roleId: idSchema.optional(),
  department: Joi.string().trim().optional(),
  isActive: booleanSchema.optional(),
  searchFields: Joi.array().items(Joi.string()).default(['firstName', 'lastName', 'email']),
});

// Role management schemas
export const createRoleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required(),
  description: Joi.string().trim().max(500).optional(),
  permissions: Joi.array().items(Joi.string()).required(),
  isActive: booleanSchema.default(true),
});

export const updateRoleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).optional(),
  description: Joi.string().trim().max(500).optional(),
  permissions: Joi.array().items(Joi.string()).optional(),
  isActive: booleanSchema.optional(),
}).min(1);

// Company schemas
export const createCompanySchema = Joi.object({
  name: nameSchema,
  industry: Joi.string().trim().max(100).required(),
  size: Joi.string().valid('startup', 'small', 'medium', 'large', 'enterprise').required(),
  website: Joi.string().uri().optional(),
  address: Joi.object({
    street: Joi.string().trim().required(),
    city: Joi.string().trim().required(),
    state: Joi.string().trim().required(),
    country: Joi.string().trim().required(),
    pincode: Joi.string().trim().required(),
  }).required(),
  gstNumber: Joi.string().trim().pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).optional(),
  contactPerson: Joi.object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
  }).required(),
});

export const updateCompanySchema = Joi.object({
  name: nameSchema.optional(),
  industry: Joi.string().trim().max(100).optional(),
  size: Joi.string().valid('startup', 'small', 'medium', 'large', 'enterprise').optional(),
  website: Joi.string().uri().optional(),
  address: Joi.object({
    street: Joi.string().trim().optional(),
    city: Joi.string().trim().optional(),
    state: Joi.string().trim().optional(),
    country: Joi.string().trim().optional(),
    pincode: Joi.string().trim().optional(),
  }).optional(),
  gstNumber: Joi.string().trim().pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).optional(),
  contactPerson: Joi.object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  }).optional(),
}).min(1);

// Module schemas
export const moduleConfigSchema = Joi.object({
  moduleId: Joi.string().required(),
  isEnabled: booleanSchema.default(true),
  config: Joi.object().optional(),
  features: Joi.array().items(Joi.string()).optional(),
});

// Billing schemas
export const subscriptionSchema = Joi.object({
  planId: idSchema,
  userTier: Joi.string().valid('starter', 'growth', 'scale', 'enterprise', 'custom').required(),
  billingCycle: Joi.string().valid('monthly', 'annual').required(),
  modules: Joi.array().items(Joi.object({
    moduleId: Joi.string().required(),
    customPrice: Joi.number().min(0).optional(),
  })).required(),
});

// Production schemas
export const productionLogSchema = Joi.object({
  shiftId: idSchema,
  employeeId: idSchema,
  partId: idSchema,
  operationId: idSchema,
  machineId: idSchema,
  quantity: Joi.number().integer().min(1).required(),
  startTime: dateSchema.required(),
  endTime: dateSchema.optional(),
  scrapQuantity: Joi.number().integer().min(0).default(0),
  ncQuantity: Joi.number().integer().min(0).default(0),
  remarks: Joi.string().trim().max(500).optional(),
});

export const oeeCalculationSchema = Joi.object({
  machineId: idSchema,
  date: dateSchema.required(),
  shiftId: idSchema,
  plannedProductionTime: Joi.number().min(0).required(),
  downtime: Joi.number().min(0).default(0),
  idealCycleTime: Joi.number().min(0).required(),
  totalCount: Joi.number().integer().min(0).required(),
  goodCount: Joi.number().integer().min(0).required(),
});

// Inventory schemas
export const itemSchema = Joi.object({
  code: Joi.string().trim().max(50).required(),
  name: Joi.string().trim().max(200).required(),
  description: Joi.string().trim().max(1000).optional(),
  category: Joi.string().trim().max(100).required(),
  unit: Joi.string().trim().max(20).required(),
  hsnCode: Joi.string().trim().max(10).optional(),
  gstRate: Joi.number().min(0).max(1).optional(),
  reorderPoint: Joi.number().min(0).required(),
  maxStock: Joi.number().min(0).optional(),
  isActive: booleanSchema.default(true),
});

export const stockMovementSchema = Joi.object({
  itemId: idSchema,
  type: Joi.string().valid('receipt', 'issue', 'adjustment').required(),
  quantity: Joi.number().min(0).required(),
  referenceType: Joi.string().valid('po', 'so', 'manual', 'production').required(),
  referenceId: Joi.string().optional(),
  warehouseId: idSchema,
  remarks: Joi.string().trim().max(500).optional(),
});

// HR schemas
export const employeeSchema = Joi.object({
  employeeId: Joi.string().trim().max(20).required(),
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  department: Joi.string().trim().max(100).required(),
  designation: Joi.string().trim().max(100).required(),
  dateOfJoining: dateSchema.required(),
  dateOfBirth: dateSchema.optional(),
  gender: Joi.string().valid('male', 'female', 'other').optional(),
  address: Joi.object({
    street: Joi.string().trim().optional(),
    city: Joi.string().trim().optional(),
    state: Joi.string().trim().optional(),
    pincode: Joi.string().trim().optional(),
  }).optional(),
  salary: Joi.number().min(0).optional(),
  isActive: booleanSchema.default(true),
});

export const leaveRequestSchema = Joi.object({
  leaveType: Joi.string().valid('casual', 'sick', 'earned', 'maternity', 'paternity').required(),
  startDate: dateSchema.required(),
  endDate: dateSchema.required(),
  reason: Joi.string().trim().max(500).required(),
  contactNumber: phoneSchema.optional(),
});

export const attendanceLogSchema = Joi.object({
  employeeId: idSchema,
  date: dateSchema.required(),
  checkIn: dateSchema.optional(),
  checkOut: dateSchema.optional(),
  breakStart: dateSchema.optional(),
  breakEnd: dateSchema.optional(),
  totalHours: Joi.number().min(0).optional(),
  status: Joi.string().valid('present', 'absent', 'half-day', 'late').optional(),
});

// Maintenance schemas
export const machineSchema = Joi.object({
  code: Joi.string().trim().max(50).required(),
  name: Joi.string().trim().max(200).required(),
  type: Joi.string().trim().max(100).required(),
  location: Joi.string().trim().max(200).required(),
  manufacturer: Joi.string().trim().max(100).optional(),
  model: Joi.string().trim().max(100).optional(),
  serialNumber: Joi.string().trim().max(100).optional(),
  installationDate: dateSchema.optional(),
  capacity: Joi.object().optional(), // Machine-specific capacity details
  specifications: Joi.object().optional(), // Technical specifications
  isActive: booleanSchema.default(true),
});

export const maintenanceScheduleSchema = Joi.object({
  machineId: idSchema,
  type: Joi.string().valid('preventive', 'predictive', 'condition-based').required(),
  title: Joi.string().trim().max(200).required(),
  description: Joi.string().trim().max(1000).optional(),
  frequency: Joi.string().valid('daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly').required(),
  estimatedDuration: Joi.number().min(0).required(), // in hours
  requiredParts: Joi.array().items(Joi.object({
    partId: idSchema,
    quantity: Joi.number().min(1).required(),
  })).optional(),
  checklist: Joi.array().items(Joi.string()).optional(),
  isActive: booleanSchema.default(true),
});

export const breakdownReportSchema = Joi.object({
  machineId: idSchema,
  reportedBy: idSchema,
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
  category: Joi.string().trim().max(100).required(),
  description: Joi.string().trim().max(1000).required(),
  symptoms: Joi.array().items(Joi.string()).optional(),
  possibleCauses: Joi.array().items(Joi.string()).optional(),
  attachments: Joi.array().items(Joi.string()).optional(), // File URLs
});

// Finance schemas
export const invoiceSchema = Joi.object({
  type: Joi.string().valid('sales', 'purchase').required(),
  reference: Joi.string().trim().max(50).optional(),
  customerId: idSchema.optional(),
  vendorId: idSchema.optional(),
  invoiceDate: dateSchema.required(),
  dueDate: dateSchema.required(),
  items: Joi.array().items(Joi.object({
    itemId: idSchema.optional(),
    description: Joi.string().trim().max(500).required(),
    quantity: Joi.number().min(0).required(),
    rate: Joi.number().min(0).required(),
    discount: Joi.number().min(0).default(0),
    gstRate: Joi.number().min(0).max(1).optional(),
  })).required(),
  notes: Joi.string().trim().max(1000).optional(),
});

export const paymentSchema = Joi.object({
  invoiceId: idSchema,
  amount: Joi.number().min(0).required(),
  paymentDate: dateSchema.required(),
  paymentMethod: Joi.string().valid('cash', 'bank-transfer', 'cheque', 'upi', 'card').required(),
  reference: Joi.string().trim().max(100).optional(),
  notes: Joi.string().trim().max(500).optional(),
});

// Visitor schemas
export const visitorRegistrationSchema = Joi.object({
  name: nameSchema,
  email: emailSchema.optional(),
  phone: phoneSchema,
  company: Joi.string().trim().max(200).optional(),
  purpose: Joi.string().trim().max(500).required(),
  hostEmployeeId: idSchema,
  expectedArrival: dateSchema.required(),
  expectedDeparture: dateSchema.optional(),
  idProof: Joi.string().optional(), // File URL
  vehicleNumber: Joi.string().trim().max(20).optional(),
});

export const visitorCheckInSchema = Joi.object({
  visitorId: idSchema,
  checkInTime: dateSchema.optional(),
  badgeNumber: Joi.string().trim().max(20).optional(),
  gate: Joi.string().trim().max(50).optional(),
});

export const visitorCheckOutSchema = Joi.object({
  visitorId: idSchema,
  checkOutTime: dateSchema.optional(),
  remarks: Joi.string().trim().max(500).optional(),
});

// Validation middleware
export function validate(schema: Joi.ObjectSchema) {
  return (data: any) => {
    const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: true });

    if (error) {
      throw ValidationError.fromJoi(error);
    }

    return value;
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