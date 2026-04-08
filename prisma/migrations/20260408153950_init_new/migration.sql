-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('INR', 'USD', 'EUR', 'GBP', 'AED');

-- CreateEnum
CREATE TYPE "LanguageCode" AS ENUM ('en', 'hi', 'ta', 'te', 'mr', 'kn');

-- CreateEnum
CREATE TYPE "TimeFormat" AS ENUM ('TWELVE_HOUR', 'TWENTY_FOUR_HOUR');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('DAY', 'NIGHT', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "BreakType" AS ENUM ('FIXED', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_STOCK', 'ASSIGNED', 'UNDER_REPAIR', 'PENDING_RETURN', 'RETIRED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'EARLY_EXIT', 'INCOMPLETE', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF', 'REGULARIZED', 'LOP');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('BIOMETRIC', 'FACE_RECOGNITION', 'MOBILE_GPS', 'WEB_PORTAL', 'MANUAL', 'IOT', 'SMART_CARD');

-- CreateEnum
CREATE TYPE "OverrideStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PunchMode" AS ENUM ('FIRST_LAST', 'EVERY_PAIR', 'SHIFT_BASED');

-- CreateEnum
CREATE TYPE "RoundingStrategy" AS ENUM ('NONE', 'NEAREST_15', 'NEAREST_30', 'FLOOR_15', 'CEIL_15');

-- CreateEnum
CREATE TYPE "PunchRounding" AS ENUM ('NONE', 'NEAREST_5', 'NEAREST_15');

-- CreateEnum
CREATE TYPE "RoundingDirection" AS ENUM ('NEAREST', 'UP', 'DOWN');

-- CreateEnum
CREATE TYPE "DeductionType" AS ENUM ('NONE', 'HALF_DAY_AFTER_LIMIT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "LocationAccuracy" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('BIOMETRIC', 'MOBILE_GPS', 'WEB_PORTAL', 'SMART_CARD', 'FACE_RECOGNITION');

-- CreateEnum
CREATE TYPE "OTCalculationBasis" AS ENUM ('AFTER_SHIFT', 'TOTAL_HOURS');

-- CreateEnum
CREATE TYPE "OvertimeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'COMP_OFF_ACCRUED');

-- CreateEnum
CREATE TYPE "OTMultiplierSource" AS ENUM ('WEEKDAY', 'WEEKEND', 'HOLIDAY', 'NIGHT_SHIFT');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('NATIONAL', 'REGIONAL', 'COMPANY', 'OPTIONAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "RosterPattern" AS ENUM ('MON_FRI', 'MON_SAT', 'MON_SAT_ALT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_NOTICE', 'SUSPENDED', 'EXITED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('ON_SITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('NEFT', 'IMPS', 'CHEQUE');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('SAVINGS', 'CURRENT');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('JOINED', 'PROBATION_STARTED', 'CONFIRMED', 'PROMOTED', 'TRANSFERRED', 'SALARY_REVISED', 'ONBOARDING_COMPLETE', 'RESIGNED', 'TERMINATED', 'EXITED', 'DOCUMENT_UPLOADED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'ESCALATED', 'AUTO_APPROVED', 'AUTO_REJECTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'IN_APP', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'LOCKED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH', 'PERSONAL_CARD', 'COMPANY_CARD', 'BANK_TRANSFER', 'UPI', 'OTHER');

-- CreateEnum
CREATE TYPE "GrievanceStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "DisciplineActionType" AS ENUM ('VERBAL_WARNING', 'WRITTEN_WARNING', 'SHOW_CAUSE', 'PIP', 'SUSPENSION', 'TERMINATION');

-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('PAID', 'UNPAID', 'COMPENSATORY', 'STATUTORY');

-- CreateEnum
CREATE TYPE "AccrualFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'PRO_RATA', 'UPFRONT');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'AUTO_APPROVED');

-- CreateEnum
CREATE TYPE "SeparationType" AS ENUM ('VOLUNTARY_RESIGNATION', 'RETIREMENT', 'TERMINATION_FOR_CAUSE', 'LAYOFF_RETRENCHMENT', 'DEATH', 'ABSCONDING', 'CONTRACT_END');

-- CreateEnum
CREATE TYPE "ExitStatus" AS ENUM ('INITIATED', 'NOTICE_PERIOD', 'CLEARANCE_PENDING', 'CLEARANCE_DONE', 'FNF_COMPUTED', 'FNF_PAID', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ClearanceStatus" AS ENUM ('PENDING', 'CLEARED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "FnFStatus" AS ENUM ('DRAFT', 'COMPUTED', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "JobLevel" AS ENUM ('L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION');

-- CreateEnum
CREATE TYPE "CalculationMethod" AS ENUM ('FIXED', 'PERCENT_OF_BASIC', 'PERCENT_OF_GROSS', 'FORMULA');

-- CreateEnum
CREATE TYPE "TaxTreatment" AS ENUM ('FULLY_TAXABLE', 'PARTIALLY_EXEMPT', 'FULLY_EXEMPT');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('PENDING', 'APPROVED', 'ACTIVE', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('OLD', 'NEW');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'ATTENDANCE_LOCKED', 'EXCEPTIONS_REVIEWED', 'COMPUTED', 'STATUTORY_DONE', 'APPROVED', 'DISBURSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StatutoryFilingType" AS ENUM ('PF_ECR', 'ESI_CHALLAN', 'PT_CHALLAN', 'TDS_24Q', 'FORM_16', 'BONUS_STATEMENT', 'GRATUITY_REGISTER', 'LWF_STATEMENT');

-- CreateEnum
CREATE TYPE "StatutoryFilingStatus" AS ENUM ('PENDING', 'GENERATED', 'FILED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "SalaryHoldType" AS ENUM ('FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('DRAFT', 'APPROVED', 'APPLIED');

-- CreateEnum
CREATE TYPE "AppraisalCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REVIEW', 'CALIBRATION', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppraisalEntryStatus" AS ENUM ('PENDING', 'SELF_REVIEW', 'MANAGER_REVIEW', 'SKIP_LEVEL', 'HR_REVIEW', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "RaterType" AS ENUM ('SELF', 'MANAGER', 'PEER', 'SUBORDINATE', 'CROSS_FUNCTION', 'INTERNAL_CUSTOMER');

-- CreateEnum
CREATE TYPE "SuccessorReadiness" AS ENUM ('READY_NOW', 'ONE_YEAR', 'TWO_YEARS', 'NOT_READY');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'OPEN', 'INTERVIEWING', 'OFFERED', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CandidateStage" AS ENUM ('APPLIED', 'SHORTLISTED', 'HR_ROUND', 'TECHNICAL', 'FINAL', 'ASSESSMENT', 'OFFER_SENT', 'HIRED', 'REJECTED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "RequisitionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EvalRecommendation" AS ENUM ('STRONG_HIRE', 'HIRE', 'MAYBE', 'NO_HIRE', 'STRONG_NO_HIRE');

-- CreateEnum
CREATE TYPE "TrainingMode" AS ENUM ('ONLINE', 'CLASSROOM', 'WORKSHOP', 'EXTERNAL', 'BLENDED', 'ON_THE_JOB');

-- CreateEnum
CREATE TYPE "TrainingNominationStatus" AS ENUM ('NOMINATED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrainingSessionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrainingAttendanceStatus" AS ENUM ('REGISTERED', 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "EvaluationType" AS ENUM ('PARTICIPANT_FEEDBACK', 'TRAINER_ASSESSMENT');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('EARNED', 'EXPIRING_SOON', 'EXPIRED', 'RENEWED');

-- CreateEnum
CREATE TYPE "ProgramEnrollmentStatus" AS ENUM ('ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('RECOMMENDED', 'REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'COMPANY_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "UserTier" AS ENUM ('STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('MONTHLY', 'ANNUAL', 'ONE_TIME_AMC');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('SUBSCRIPTION', 'ONE_TIME_LICENSE', 'AMC', 'PRORATED_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AmcStatus" AS ENUM ('ACTIVE', 'OVERDUE', 'LAPSED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CHEQUE', 'CASH', 'RAZORPAY', 'UPI', 'OTHER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'TRIAL', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CompanySize" AS ENUM ('STARTUP', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('MODULE_CHANGE', 'BILLING', 'TECHNICAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SenderRole" AS ENUM ('COMPANY_ADMIN', 'SUPER_ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "geofences" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radius" INTEGER NOT NULL DEFAULT 100,
    "address" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "facilityType" TEXT NOT NULL,
    "customFacilityType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "isHQ" BOOLEAN NOT NULL DEFAULT false,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "district" TEXT,
    "state" TEXT,
    "pin" TEXT,
    "country" TEXT DEFAULT 'India',
    "stdCode" TEXT,
    "gstin" TEXT,
    "stateGST" TEXT,
    "contactName" TEXT,
    "contactDesignation" TEXT,
    "contactEmail" TEXT,
    "contactCountryCode" TEXT DEFAULT '+91',
    "contactPhone" TEXT,
    "geoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "geoLocationName" TEXT,
    "geoLat" TEXT,
    "geoLng" TEXT,
    "geoRadius" INTEGER NOT NULL DEFAULT 50,
    "geoShape" TEXT DEFAULT 'circle',
    "allowedDevices" "DeviceType"[],
    "requireSelfie" BOOLEAN,
    "requireLiveLocation" BOOLEAN,
    "geoPolygon" JSONB,
    "moduleIds" JSONB,
    "customModulePricing" JSONB,
    "userTier" TEXT,
    "customUserLimit" TEXT,
    "customTierPrice" TEXT,
    "billingType" TEXT DEFAULT 'monthly',
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "oneTimeLicenseFee" DOUBLE PRECISION,
    "amcAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_contacts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "department" TEXT,
    "type" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT '+91',
    "mobile" TEXT NOT NULL,
    "linkedin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "no_series_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "linkedScreen" TEXT NOT NULL,
    "description" TEXT,
    "prefix" TEXT NOT NULL,
    "suffix" TEXT,
    "numberCount" INTEGER NOT NULL DEFAULT 5,
    "startNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "no_series_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iot_reasons" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reasonType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "department" TEXT,
    "planned" BOOLEAN NOT NULL DEFAULT false,
    "duration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iot_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'INR',
    "language" "LanguageCode" NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "timeFormat" "TimeFormat" NOT NULL DEFAULT 'TWELVE_HOUR',
    "numberFormat" TEXT NOT NULL DEFAULT 'en-IN',
    "indiaCompliance" BOOLEAN NOT NULL DEFAULT true,
    "gdprMode" BOOLEAN NOT NULL DEFAULT false,
    "auditTrail" BOOLEAN NOT NULL DEFAULT true,
    "bankIntegration" BOOLEAN NOT NULL DEFAULT false,
    "razorpayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "whatsappNotifications" BOOLEAN NOT NULL DEFAULT false,
    "biometricIntegration" BOOLEAN NOT NULL DEFAULT false,
    "eSignIntegration" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_controls" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "attendanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "leaveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payrollEnabled" BOOLEAN NOT NULL DEFAULT true,
    "essEnabled" BOOLEAN NOT NULL DEFAULT true,
    "performanceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recruitmentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trainingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mobileAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiChatbotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ncEditMode" BOOLEAN NOT NULL DEFAULT false,
    "loadUnload" BOOLEAN NOT NULL DEFAULT false,
    "cycleTime" BOOLEAN NOT NULL DEFAULT false,
    "payrollLock" BOOLEAN NOT NULL DEFAULT true,
    "backdatedEntryControl" BOOLEAN NOT NULL DEFAULT false,
    "leaveCarryForward" BOOLEAN NOT NULL DEFAULT true,
    "compOffEnabled" BOOLEAN NOT NULL DEFAULT false,
    "halfDayLeaveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
    "sessionTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxConcurrentSessions" INTEGER NOT NULL DEFAULT 3,
    "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
    "passwordComplexity" BOOLEAN NOT NULL DEFAULT true,
    "accountLockThreshold" INTEGER NOT NULL DEFAULT 5,
    "accountLockDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "biometricLoginEnabled" BOOLEAN NOT NULL DEFAULT true,
    "auditLogRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_shifts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shiftType" "ShiftType" NOT NULL DEFAULT 'DAY',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isCrossDay" BOOLEAN NOT NULL DEFAULT false,
    "gracePeriodMinutes" INTEGER,
    "earlyExitToleranceMinutes" INTEGER,
    "halfDayThresholdHours" DECIMAL(4,2),
    "fullDayThresholdHours" DECIMAL(4,2),
    "maxLateCheckInMinutes" INTEGER,
    "minWorkingHoursForOT" DECIMAL(4,2),
    "requireSelfie" BOOLEAN,
    "requireGPS" BOOLEAN,
    "allowedSources" "DeviceType"[],
    "noShuffle" BOOLEAN NOT NULL DEFAULT false,
    "autoClockOutMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_breaks" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT,
    "duration" INTEGER NOT NULL,
    "type" "BreakType" NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "shift_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "port" INTEGER,
    "syncMode" TEXT NOT NULL DEFAULT 'PULL',
    "syncIntervalMin" INTEGER NOT NULL DEFAULT 5,
    "locationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "enrolledCount" INTEGER NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "biometric_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_rotation_schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rotationPattern" TEXT NOT NULL,
    "shifts" JSONB NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_rotation_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_rotation_assignments" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_rotation_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_incentive_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "incentiveBasis" TEXT NOT NULL,
    "calculationCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "slabs" JSONB NOT NULL,
    "machineId" TEXT,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_incentive_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_incentive_records" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodDate" DATE NOT NULL,
    "outputUnits" DECIMAL(10,2) NOT NULL,
    "incentiveAmount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPUTED',
    "payrollRunId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_incentive_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_retention_policies" (
    "id" TEXT NOT NULL,
    "dataCategory" TEXT NOT NULL,
    "retentionYears" INTEGER NOT NULL,
    "actionAfter" TEXT NOT NULL DEFAULT 'ARCHIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_access_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "responseUrl" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WEB',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "escalatedTo" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_analytics_daily" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalHeadcount" INTEGER NOT NULL,
    "activeCount" INTEGER NOT NULL,
    "probationCount" INTEGER NOT NULL,
    "noticeCount" INTEGER NOT NULL,
    "separatedCount" INTEGER NOT NULL,
    "joinersCount" INTEGER NOT NULL,
    "leaversCount" INTEGER NOT NULL,
    "transfersCount" INTEGER NOT NULL,
    "promotionsCount" INTEGER NOT NULL,
    "byDepartment" JSONB NOT NULL,
    "byLocation" JSONB NOT NULL,
    "byGrade" JSONB NOT NULL,
    "byEmployeeType" JSONB NOT NULL,
    "byGender" JSONB NOT NULL,
    "byAgeBand" JSONB NOT NULL,
    "byTenureBand" JSONB NOT NULL,
    "avgSpanOfControl" DOUBLE PRECISION,
    "vacancyRate" DOUBLE PRECISION,

    CONSTRAINT "employee_analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_analytics_daily" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalEmployees" INTEGER NOT NULL,
    "presentCount" INTEGER NOT NULL,
    "absentCount" INTEGER NOT NULL,
    "lateCount" INTEGER NOT NULL,
    "halfDayCount" INTEGER NOT NULL,
    "onLeaveCount" INTEGER NOT NULL,
    "weekOffCount" INTEGER NOT NULL,
    "holidayCount" INTEGER NOT NULL,
    "avgWorkedHours" DOUBLE PRECISION NOT NULL,
    "totalOvertimeHours" DOUBLE PRECISION NOT NULL,
    "totalOvertimeCost" DOUBLE PRECISION,
    "productivityIndex" DOUBLE PRECISION NOT NULL,
    "avgLateMinutes" DOUBLE PRECISION NOT NULL,
    "lateThresholdBreaches" INTEGER NOT NULL,
    "regularizationCount" INTEGER NOT NULL,
    "missedPunchCount" INTEGER NOT NULL,
    "byDepartment" JSONB NOT NULL,
    "byLocation" JSONB NOT NULL,
    "byShift" JSONB NOT NULL,
    "bySource" JSONB NOT NULL,

    CONSTRAINT "attendance_analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_analytics_monthly" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeCount" INTEGER NOT NULL,
    "totalGrossEarnings" DOUBLE PRECISION NOT NULL,
    "totalDeductions" DOUBLE PRECISION NOT NULL,
    "totalNetPay" DOUBLE PRECISION NOT NULL,
    "totalEmployerCost" DOUBLE PRECISION NOT NULL,
    "totalPFEmployee" DOUBLE PRECISION NOT NULL,
    "totalPFEmployer" DOUBLE PRECISION NOT NULL,
    "totalESIEmployee" DOUBLE PRECISION NOT NULL,
    "totalESIEmployer" DOUBLE PRECISION NOT NULL,
    "totalPT" DOUBLE PRECISION NOT NULL,
    "totalTDS" DOUBLE PRECISION NOT NULL,
    "totalLWFEmployee" DOUBLE PRECISION NOT NULL,
    "totalLWFEmployer" DOUBLE PRECISION NOT NULL,
    "totalGratuityProvision" DOUBLE PRECISION NOT NULL,
    "avgCTC" DOUBLE PRECISION NOT NULL,
    "medianCTC" DOUBLE PRECISION NOT NULL,
    "exceptionCount" INTEGER NOT NULL,
    "varianceFromLastMonth" DOUBLE PRECISION,
    "totalLoanOutstanding" DOUBLE PRECISION NOT NULL,
    "activeLoanCount" INTEGER NOT NULL,
    "totalSalaryHolds" INTEGER NOT NULL,
    "totalBonusDisbursed" DOUBLE PRECISION NOT NULL,
    "totalIncentivesPaid" DOUBLE PRECISION NOT NULL,
    "byDepartment" JSONB NOT NULL,
    "byLocation" JSONB NOT NULL,
    "byGrade" JSONB NOT NULL,
    "byCTCBand" JSONB NOT NULL,
    "byComponent" JSONB NOT NULL,

    CONSTRAINT "payroll_analytics_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attrition_metrics_monthly" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attritionRate" DOUBLE PRECISION NOT NULL,
    "voluntaryRate" DOUBLE PRECISION NOT NULL,
    "involuntaryRate" DOUBLE PRECISION NOT NULL,
    "earlyAttritionRate" DOUBLE PRECISION NOT NULL,
    "totalExits" INTEGER NOT NULL,
    "voluntaryExits" INTEGER NOT NULL,
    "involuntaryExits" INTEGER NOT NULL,
    "retirements" INTEGER NOT NULL,
    "earlyExits" INTEGER NOT NULL,
    "avgTenureAtExit" DOUBLE PRECISION NOT NULL,
    "exitReasonBreakdown" JSONB NOT NULL,
    "wouldRecommendAvg" DOUBLE PRECISION,
    "flightRiskEmployees" JSONB NOT NULL,
    "pendingFnFCount" INTEGER NOT NULL,
    "totalFnFAmount" DOUBLE PRECISION NOT NULL,
    "avgFnFProcessingDays" DOUBLE PRECISION NOT NULL,
    "byDepartment" JSONB NOT NULL,
    "byGrade" JSONB NOT NULL,
    "byTenureBand" JSONB NOT NULL,
    "bySeparationType" JSONB NOT NULL,

    CONSTRAINT "attrition_metrics_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_alerts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dashboard" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "analytics_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "dashboard" TEXT,
    "reportType" TEXT,
    "filters" JSONB,
    "exportFormat" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_history" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "reportTitle" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'excel',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "fileSize" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "depreciationRate" DECIMAL(5,2),
    "returnChecklist" JSONB,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "assetNumber" TEXT,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "purchaseDate" DATE,
    "purchaseValue" DECIMAL(15,2),
    "condition" "AssetCondition" NOT NULL DEFAULT 'NEW',
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_STOCK',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignments" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "returnDate" DATE,
    "returnCondition" "AssetCondition",
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftId" TEXT,
    "punchIn" TIMESTAMP(3),
    "punchOut" TIMESTAMP(3),
    "workedHours" DECIMAL(5,2),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "lateMinutes" INTEGER,
    "isEarlyExit" BOOLEAN NOT NULL DEFAULT false,
    "earlyMinutes" INTEGER,
    "overtimeHours" DECIMAL(5,2),
    "remarks" TEXT,
    "locationId" TEXT,
    "checkInLatitude" DOUBLE PRECISION,
    "checkInLongitude" DOUBLE PRECISION,
    "checkOutLatitude" DOUBLE PRECISION,
    "checkOutLongitude" DOUBLE PRECISION,
    "checkInPhotoUrl" TEXT,
    "checkOutPhotoUrl" TEXT,
    "geoStatus" TEXT,
    "isRegularized" BOOLEAN NOT NULL DEFAULT false,
    "regularizedAt" TIMESTAMP(3),
    "regularizedBy" TEXT,
    "regularizationReason" TEXT,
    "leaveRequestId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedGracePeriodMinutes" INTEGER,
    "appliedFullDayThresholdHours" DECIMAL(4,2),
    "appliedHalfDayThresholdHours" DECIMAL(4,2),
    "appliedBreakDeductionMinutes" INTEGER,
    "appliedPunchMode" "PunchMode",
    "appliedLateDeduction" DECIMAL(10,2),
    "appliedEarlyExitDeduction" DECIMAL(10,2),
    "resolutionTrace" JSONB,
    "evaluationContext" JSONB,
    "finalStatusReason" TEXT,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_overrides" (
    "id" TEXT NOT NULL,
    "attendanceRecordId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "correctedPunchIn" TIMESTAMP(3),
    "correctedPunchOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "status" "OverrideStatus" NOT NULL DEFAULT 'PENDING',
    "payrollImpact" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dayBoundaryTime" TEXT NOT NULL DEFAULT '00:00',
    "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 15,
    "earlyExitToleranceMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxLateCheckInMinutes" INTEGER NOT NULL DEFAULT 240,
    "halfDayThresholdHours" DECIMAL(4,2) NOT NULL DEFAULT 4,
    "fullDayThresholdHours" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "lateArrivalsAllowedPerMonth" INTEGER NOT NULL DEFAULT 3,
    "lopAutoDeduct" BOOLEAN NOT NULL DEFAULT true,
    "lateDeductionType" "DeductionType" NOT NULL DEFAULT 'NONE',
    "lateDeductionValue" DECIMAL(5,2),
    "earlyExitDeductionType" "DeductionType" NOT NULL DEFAULT 'NONE',
    "earlyExitDeductionValue" DECIMAL(5,2),
    "punchMode" "PunchMode" NOT NULL DEFAULT 'FIRST_LAST',
    "autoMarkAbsentIfNoPunch" BOOLEAN NOT NULL DEFAULT true,
    "autoHalfDayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoAbsentAfterDays" INTEGER NOT NULL DEFAULT 0,
    "regularizationWindowDays" INTEGER NOT NULL DEFAULT 7,
    "workingHoursRounding" "RoundingStrategy" NOT NULL DEFAULT 'NONE',
    "punchTimeRounding" "PunchRounding" NOT NULL DEFAULT 'NONE',
    "punchTimeRoundingDirection" "RoundingDirection" NOT NULL DEFAULT 'NEAREST',
    "ignoreLateOnLeaveDay" BOOLEAN NOT NULL DEFAULT true,
    "ignoreLateOnHoliday" BOOLEAN NOT NULL DEFAULT true,
    "ignoreLateOnWeekOff" BOOLEAN NOT NULL DEFAULT true,
    "selfieRequired" BOOLEAN NOT NULL DEFAULT false,
    "gpsRequired" BOOLEAN NOT NULL DEFAULT false,
    "missingPunchAlert" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_calendars" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'COMPANY',
    "branchIds" JSONB,
    "year" INTEGER NOT NULL,
    "description" TEXT,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "maxOptionalSlots" INTEGER,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holiday_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rosters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pattern" "RosterPattern" NOT NULL DEFAULT 'MON_FRI',
    "weekOff1" TEXT,
    "weekOff2" TEXT,
    "applicableTypeIds" JSONB,
    "effectiveFrom" DATE NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eligibleTypeIds" JSONB,
    "calculationBasis" "OTCalculationBasis" NOT NULL DEFAULT 'AFTER_SHIFT',
    "thresholdMinutes" INTEGER NOT NULL DEFAULT 30,
    "minimumOtMinutes" INTEGER NOT NULL DEFAULT 30,
    "includeBreaksInOT" BOOLEAN NOT NULL DEFAULT false,
    "weekdayMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.5,
    "weekendMultiplier" DECIMAL(3,2),
    "holidayMultiplier" DECIMAL(3,2),
    "nightShiftMultiplier" DECIMAL(3,2),
    "dailyCapHours" DECIMAL(4,1),
    "weeklyCapHours" DECIMAL(5,1),
    "monthlyCapHours" DECIMAL(5,1),
    "enforceCaps" BOOLEAN NOT NULL DEFAULT false,
    "maxContinuousOtHours" DECIMAL(4,1),
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "autoIncludePayroll" BOOLEAN NOT NULL DEFAULT false,
    "compOffEnabled" BOOLEAN NOT NULL DEFAULT false,
    "compOffExpiryDays" INTEGER,
    "roundingStrategy" "RoundingStrategy" NOT NULL DEFAULT 'NONE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" TEXT NOT NULL,
    "attendanceRecordId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "overtimeRuleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "requestedHours" DECIMAL(5,2) NOT NULL,
    "appliedMultiplier" DECIMAL(3,2) NOT NULL,
    "multiplierSource" "OTMultiplierSource" NOT NULL,
    "calculatedAmount" DECIMAL(15,2),
    "status" "OvertimeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvalNotes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "compOffGranted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "maritalStatus" "MaritalStatus",
    "bloodGroup" TEXT,
    "fatherMotherName" TEXT,
    "nationality" TEXT NOT NULL DEFAULT 'Indian',
    "religion" TEXT,
    "category" TEXT,
    "differentlyAbled" BOOLEAN NOT NULL DEFAULT false,
    "disabilityType" TEXT,
    "profilePhotoUrl" TEXT,
    "personalMobile" TEXT NOT NULL,
    "alternativeMobile" TEXT,
    "personalEmail" TEXT NOT NULL,
    "officialEmail" TEXT,
    "currentAddress" JSONB,
    "permanentAddress" JSONB,
    "emergencyContactName" TEXT NOT NULL,
    "emergencyContactRelation" TEXT NOT NULL,
    "emergencyContactMobile" TEXT NOT NULL,
    "joiningDate" TIMESTAMP(3) NOT NULL,
    "employeeTypeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "designationId" TEXT NOT NULL,
    "gradeId" TEXT,
    "reportingManagerId" TEXT,
    "functionalManagerId" TEXT,
    "workType" "WorkType",
    "shiftId" TEXT,
    "costCentreId" TEXT,
    "locationId" TEXT,
    "geofenceId" TEXT,
    "noticePeriodDays" INTEGER,
    "probationEndDate" TIMESTAMP(3),
    "confirmationDate" TIMESTAMP(3),
    "annualCtc" DECIMAL(15,2),
    "salaryStructure" JSONB,
    "paymentMode" "PaymentMode",
    "bankAccountNumber" TEXT,
    "bankIfscCode" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "accountType" "AccountType",
    "panNumber" TEXT,
    "aadhaarNumber" TEXT,
    "uan" TEXT,
    "esiIpNumber" TEXT,
    "passportNumber" TEXT,
    "passportExpiry" TIMESTAMP(3),
    "drivingLicence" TEXT,
    "voterId" TEXT,
    "pran" TEXT,
    "vpfPercentage" DECIMAL(5,2),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'PROBATION',
    "lastWorkingDate" TIMESTAMP(3),
    "exitReason" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_nominees" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "sharePercent" DECIMAL(5,2),
    "aadhaar" TEXT,
    "pan" TEXT,
    "address" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_nominees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_education" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "degree" TEXT,
    "institution" TEXT,
    "university" TEXT,
    "yearOfPassing" INTEGER,
    "marks" TEXT,
    "certificateUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_prev_employments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employerName" TEXT NOT NULL,
    "designation" TEXT,
    "lastCtc" DECIMAL(15,2),
    "joinDate" TIMESTAMP(3),
    "leaveDate" TIMESTAMP(3),
    "reason" TEXT,
    "experienceLetterUrl" TEXT,
    "relievingLetterUrl" TEXT,
    "previousPfAccount" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_prev_employments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_timeline" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "eventType" "TimelineEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventData" JSONB,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ess_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "viewPayslips" BOOLEAN NOT NULL DEFAULT true,
    "downloadPayslips" BOOLEAN NOT NULL DEFAULT true,
    "downloadForm16" BOOLEAN NOT NULL DEFAULT true,
    "viewSalaryStructure" BOOLEAN NOT NULL DEFAULT true,
    "itDeclaration" BOOLEAN NOT NULL DEFAULT true,
    "leaveApplication" BOOLEAN NOT NULL DEFAULT true,
    "leaveBalanceView" BOOLEAN NOT NULL DEFAULT true,
    "leaveCancellation" BOOLEAN NOT NULL DEFAULT true,
    "attendanceView" BOOLEAN NOT NULL DEFAULT true,
    "attendanceRegularization" BOOLEAN NOT NULL DEFAULT true,
    "viewShiftSchedule" BOOLEAN NOT NULL DEFAULT true,
    "shiftSwapRequest" BOOLEAN NOT NULL DEFAULT true,
    "wfhRequest" BOOLEAN NOT NULL DEFAULT true,
    "profileUpdate" BOOLEAN NOT NULL DEFAULT true,
    "documentUpload" BOOLEAN NOT NULL DEFAULT true,
    "employeeDirectory" BOOLEAN NOT NULL DEFAULT true,
    "viewOrgChart" BOOLEAN NOT NULL DEFAULT true,
    "reimbursementClaims" BOOLEAN NOT NULL DEFAULT true,
    "loanApplication" BOOLEAN NOT NULL DEFAULT true,
    "assetView" BOOLEAN NOT NULL DEFAULT true,
    "performanceGoals" BOOLEAN NOT NULL DEFAULT true,
    "appraisalAccess" BOOLEAN NOT NULL DEFAULT true,
    "feedback360" BOOLEAN NOT NULL DEFAULT true,
    "trainingEnrollment" BOOLEAN NOT NULL DEFAULT true,
    "helpDesk" BOOLEAN NOT NULL DEFAULT true,
    "grievanceSubmission" BOOLEAN NOT NULL DEFAULT true,
    "holidayCalendar" BOOLEAN NOT NULL DEFAULT true,
    "policyDocuments" BOOLEAN NOT NULL DEFAULT true,
    "announcementBoard" BOOLEAN NOT NULL DEFAULT true,
    "mssViewTeam" BOOLEAN NOT NULL DEFAULT true,
    "mssApproveLeave" BOOLEAN NOT NULL DEFAULT true,
    "mssApproveAttendance" BOOLEAN NOT NULL DEFAULT true,
    "mssViewTeamAttendance" BOOLEAN NOT NULL DEFAULT true,
    "mobileOfflinePunch" BOOLEAN NOT NULL DEFAULT true,
    "mobileSyncRetryMinutes" INTEGER NOT NULL DEFAULT 5,
    "mobileLocationAccuracy" "LocationAccuracy" NOT NULL DEFAULT 'HIGH',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ess_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "stepHistory" JSONB,
    "data" JSONB,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_rules" (
    "id" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "recipientRole" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "it_declarations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'NEW',
    "section80C" JSONB,
    "section80CCD" JSONB,
    "section80D" JSONB,
    "section80E" JSONB,
    "section80G" JSONB,
    "section80GG" JSONB,
    "section80TTA" JSONB,
    "hraExemption" JSONB,
    "ltaExemption" JSONB,
    "homeLoanInterest" JSONB,
    "otherIncome" JSONB,
    "status" "DeclarationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "it_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresReceipt" BOOLEAN NOT NULL DEFAULT true,
    "receiptThreshold" DECIMAL(15,2),
    "maxAmountPerClaim" DECIMAL(15,2),
    "maxAmountPerMonth" DECIMAL(15,2),
    "maxAmountPerYear" DECIMAL(15,2),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_category_limits" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "gradeId" TEXT,
    "designationId" TEXT,
    "maxAmountPerClaim" DECIMAL(15,2),
    "maxAmountPerMonth" DECIMAL(15,2),
    "maxAmountPerYear" DECIMAL(15,2),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_category_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_claims" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "category" TEXT NOT NULL,
    "receipts" JSONB,
    "description" TEXT,
    "tripDate" DATE,
    "fromDate" DATE,
    "toDate" DATE,
    "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'CASH',
    "merchantName" TEXT,
    "projectCode" TEXT,
    "costCentreId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAmount" DECIMAL(15,2),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidInPayrollId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_claim_items" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "expenseDate" DATE NOT NULL,
    "merchantName" TEXT,
    "receipts" JSONB,
    "isApproved" BOOLEAN,
    "approvedAmount" DECIMAL(15,2),
    "rejectionReason" TEXT,
    "distanceKm" DECIMAL(10,2),
    "ratePerKm" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_claim_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_letter_templates" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_letter_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_letters" (
    "id" TEXT NOT NULL,
    "letterNumber" TEXT,
    "templateId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveDate" DATE,
    "pdfUrl" TEXT,
    "eSignStatus" TEXT,
    "eSignedAt" TIMESTAMP(3),
    "eSignToken" TEXT,
    "eSignDispatchedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grievance_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slaHours" INTEGER NOT NULL DEFAULT 72,
    "autoEscalateTo" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grievance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grievance_cases" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" "GrievanceStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grievance_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplinary_actions" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "DisciplineActionType" NOT NULL,
    "charges" TEXT NOT NULL,
    "replyDueBy" DATE,
    "replyReceived" TEXT,
    "pipDuration" INTEGER,
    "pipOutcome" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issuedBy" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplinary_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "LeaveCategory" NOT NULL DEFAULT 'PAID',
    "annualEntitlement" DECIMAL(5,1) NOT NULL,
    "accrualFrequency" "AccrualFrequency" DEFAULT 'MONTHLY',
    "accrualDay" INTEGER,
    "carryForwardAllowed" BOOLEAN NOT NULL DEFAULT false,
    "maxCarryForwardDays" DECIMAL(5,1),
    "carryForwardExpiry" DATE,
    "encashmentAllowed" BOOLEAN NOT NULL DEFAULT false,
    "maxEncashableDays" DECIMAL(5,1),
    "encashmentRate" TEXT,
    "applicableTypeIds" JSONB,
    "applicableGender" TEXT,
    "probationRestricted" BOOLEAN NOT NULL DEFAULT false,
    "minTenureDays" INTEGER,
    "minAdvanceNotice" INTEGER,
    "minDaysPerApplication" INTEGER,
    "maxConsecutiveDays" INTEGER,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "weekendSandwich" BOOLEAN NOT NULL DEFAULT false,
    "holidaySandwich" BOOLEAN NOT NULL DEFAULT false,
    "documentRequired" BOOLEAN NOT NULL DEFAULT false,
    "documentAfterDays" INTEGER,
    "lopOnExcess" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policies" (
    "id" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "assignmentLevel" TEXT NOT NULL,
    "assignmentId" TEXT,
    "overrides" JSONB,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "openingBalance" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "accrued" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "taken" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "adjusted" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "balance" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "days" DECIMAL(5,1) NOT NULL,
    "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "halfDayType" TEXT,
    "reason" TEXT NOT NULL,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "rejectionNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_requests" (
    "id" TEXT NOT NULL,
    "exitNumber" TEXT,
    "employeeId" TEXT NOT NULL,
    "separationType" "SeparationType" NOT NULL,
    "resignationDate" DATE,
    "lastWorkingDate" DATE,
    "noticePeriodDays" INTEGER,
    "noticePeriodWaiver" BOOLEAN NOT NULL DEFAULT false,
    "waiverAmount" DECIMAL(15,2),
    "exitInterviewDone" BOOLEAN NOT NULL DEFAULT false,
    "exitInterviewNotes" TEXT,
    "knowledgeTransferDone" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExitStatus" NOT NULL DEFAULT 'INITIATED',
    "initiatedBy" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_clearances" (
    "id" TEXT NOT NULL,
    "exitRequestId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "clearedBy" TEXT,
    "clearedAt" TIMESTAMP(3),
    "status" "ClearanceStatus" NOT NULL DEFAULT 'PENDING',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exit_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_interviews" (
    "id" TEXT NOT NULL,
    "exitRequestId" TEXT NOT NULL,
    "responses" JSONB NOT NULL,
    "conductedBy" TEXT,
    "conductedAt" TIMESTAMP(3),
    "overallRating" INTEGER,
    "wouldRecommend" BOOLEAN,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exit_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fnf_settlements" (
    "id" TEXT NOT NULL,
    "exitRequestId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "salaryForWorkedDays" DECIMAL(15,2),
    "leaveEncashment" DECIMAL(15,2),
    "gratuityAmount" DECIMAL(15,2),
    "bonusProRata" DECIMAL(15,2),
    "noticePay" DECIMAL(15,2),
    "loanRecovery" DECIMAL(15,2),
    "assetRecovery" DECIMAL(15,2),
    "reimbursementPending" DECIMAL(15,2),
    "tdsOnFnF" DECIMAL(15,2),
    "otherDeductions" DECIMAL(15,2),
    "otherEarnings" DECIMAL(15,2),
    "totalAmount" DECIMAL(15,2),
    "components" JSONB,
    "status" "FnFStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "payslipUrl" TEXT,
    "settlementLetterUrl" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fnf_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_tasks" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATE,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "probation_reviews" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewDate" DATE NOT NULL,
    "probationEndDate" DATE NOT NULL,
    "managerFeedback" TEXT,
    "performanceRating" INTEGER,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "extensionMonths" INTEGER,
    "newProbationEnd" DATE,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "probation_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus_batches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bonusType" TEXT NOT NULL,
    "totalAmount" DECIMAL(15,2),
    "employeeCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "mergedToRunId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bonus_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus_batch_items" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "tdsAmount" DECIMAL(15,2),
    "netAmount" DECIMAL(15,2),
    "remarks" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bonus_batch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parentId" TEXT,
    "headEmployeeId" TEXT,
    "costCentreCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "departmentId" TEXT,
    "gradeId" TEXT,
    "jobLevel" "JobLevel",
    "managerialFlag" BOOLEAN NOT NULL DEFAULT false,
    "reportsTo" TEXT,
    "probationDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ctcMin" DECIMAL(15,2),
    "ctcMax" DECIMAL(15,2),
    "hraPercent" DECIMAL(5,2),
    "pfTier" TEXT,
    "benefitFlags" JSONB,
    "probationMonths" INTEGER,
    "noticeDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "pfApplicable" BOOLEAN NOT NULL DEFAULT false,
    "esiApplicable" BOOLEAN NOT NULL DEFAULT false,
    "ptApplicable" BOOLEAN NOT NULL DEFAULT false,
    "gratuityEligible" BOOLEAN NOT NULL DEFAULT false,
    "bonusEligible" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centres" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "locationId" TEXT,
    "annualBudget" DECIMAL(15,2),
    "glAccountCode" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_components" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "ComponentType" NOT NULL,
    "calculationMethod" "CalculationMethod" NOT NULL DEFAULT 'FIXED',
    "formula" TEXT,
    "formulaValue" DECIMAL(10,4),
    "taxable" "TaxTreatment" NOT NULL DEFAULT 'FULLY_TAXABLE',
    "exemptionSection" TEXT,
    "exemptionLimit" DECIMAL(15,2),
    "pfInclusion" BOOLEAN NOT NULL DEFAULT false,
    "esiInclusion" BOOLEAN NOT NULL DEFAULT false,
    "bonusInclusion" BOOLEAN NOT NULL DEFAULT false,
    "gratuityInclusion" BOOLEAN NOT NULL DEFAULT false,
    "showOnPayslip" BOOLEAN NOT NULL DEFAULT true,
    "payslipOrder" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "applicableGradeIds" JSONB,
    "applicableDesignationIds" JSONB,
    "applicableTypeIds" JSONB,
    "components" JSONB NOT NULL,
    "ctcBasis" TEXT NOT NULL DEFAULT 'CTC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salaries" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "structureId" TEXT,
    "annualCtc" DECIMAL(15,2) NOT NULL,
    "monthlyGross" DECIMAL(15,2),
    "components" JSONB NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_salaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pf_configs" (
    "id" TEXT NOT NULL,
    "employeeRate" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "employerEpfRate" DECIMAL(5,2) NOT NULL DEFAULT 3.67,
    "employerEpsRate" DECIMAL(5,2) NOT NULL DEFAULT 8.33,
    "employerEdliRate" DECIMAL(5,2) NOT NULL DEFAULT 0.5,
    "adminChargeRate" DECIMAL(5,2) NOT NULL DEFAULT 0.5,
    "wageCeiling" DECIMAL(15,2) NOT NULL DEFAULT 15000,
    "vpfEnabled" BOOLEAN NOT NULL DEFAULT false,
    "excludedComponents" JSONB,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pf_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "esi_configs" (
    "id" TEXT NOT NULL,
    "employeeRate" DECIMAL(5,2) NOT NULL DEFAULT 0.75,
    "employerRate" DECIMAL(5,2) NOT NULL DEFAULT 3.25,
    "wageCeiling" DECIMAL(15,2) NOT NULL DEFAULT 21000,
    "excludedWages" JSONB,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "esi_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pt_configs" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "slabs" JSONB NOT NULL,
    "monthlyOverrides" JSONB,
    "financialYear" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "registrationNumber" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pt_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gratuity_configs" (
    "id" TEXT NOT NULL,
    "formula" TEXT NOT NULL DEFAULT '(lastBasic * 15 * yearsOfService) / 26',
    "baseSalary" TEXT NOT NULL DEFAULT 'Basic',
    "maxAmount" DECIMAL(15,2) NOT NULL DEFAULT 2000000,
    "provisionMethod" TEXT NOT NULL DEFAULT 'MONTHLY',
    "trustExists" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gratuity_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus_configs" (
    "id" TEXT NOT NULL,
    "wageCeiling" DECIMAL(15,2) NOT NULL DEFAULT 7000,
    "minBonusPercent" DECIMAL(5,2) NOT NULL DEFAULT 8.33,
    "maxBonusPercent" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "eligibilityDays" INTEGER NOT NULL DEFAULT 30,
    "calculationPeriod" TEXT NOT NULL DEFAULT 'APR_MAR',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bonus_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lwf_configs" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "employeeAmount" DECIMAL(10,2) NOT NULL,
    "employerAmount" DECIMAL(10,2) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lwf_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_configs" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "branchName" TEXT,
    "paymentMode" TEXT NOT NULL DEFAULT 'NEFT',
    "fileFormat" TEXT,
    "autoPushOnApproval" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "loanType" TEXT NOT NULL DEFAULT 'PERSONAL',
    "maxAmount" DECIMAL(15,2),
    "maxTenureMonths" INTEGER,
    "interestRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "emiCapPercent" DECIMAL(5,2),
    "eligibilityTenureDays" INTEGER,
    "eligibleTypeIds" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "loanType" TEXT NOT NULL DEFAULT 'PERSONAL',
    "amount" DECIMAL(15,2) NOT NULL,
    "tenure" INTEGER NOT NULL,
    "emiAmount" DECIMAL(15,2) NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL,
    "outstanding" DECIMAL(15,2) NOT NULL,
    "disbursedAt" TIMESTAMP(3),
    "status" "LoanStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "isSettled" BOOLEAN NOT NULL DEFAULT false,
    "settlementClaimId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_configs" (
    "id" TEXT NOT NULL,
    "defaultRegime" "TaxRegime" NOT NULL DEFAULT 'NEW',
    "oldRegimeSlabs" JSONB NOT NULL,
    "newRegimeSlabs" JSONB NOT NULL,
    "declarationDeadline" DATE,
    "surchargeRates" JSONB,
    "cessRate" DECIMAL(5,2) NOT NULL DEFAULT 4,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "computedBy" TEXT,
    "computedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "totalGross" DECIMAL(15,2),
    "totalDeductions" DECIMAL(15,2),
    "totalNet" DECIMAL(15,2),
    "employeeCount" INTEGER,
    "exceptionsCount" INTEGER,
    "exceptions" JSONB,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_entries" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "grossEarnings" DECIMAL(15,2) NOT NULL,
    "totalDeductions" DECIMAL(15,2) NOT NULL,
    "netPay" DECIMAL(15,2) NOT NULL,
    "earnings" JSONB NOT NULL,
    "deductions" JSONB NOT NULL,
    "employerContributions" JSONB,
    "workingDays" DECIMAL(5,1),
    "presentDays" DECIMAL(5,1),
    "lopDays" DECIMAL(5,1),
    "overtimeHours" DECIMAL(5,1),
    "overtimeAmount" DECIMAL(15,2),
    "pfEmployee" DECIMAL(15,2),
    "pfEmployer" DECIMAL(15,2),
    "vpfAmount" DECIMAL(15,2),
    "esiEmployee" DECIMAL(15,2),
    "esiEmployer" DECIMAL(15,2),
    "ptAmount" DECIMAL(15,2),
    "tdsAmount" DECIMAL(15,2),
    "lwfEmployee" DECIMAL(15,2),
    "lwfEmployer" DECIMAL(15,2),
    "loanDeduction" DECIMAL(15,2),
    "variancePercent" DECIMAL(5,2),
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "exceptionNote" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "pdfUrl" TEXT,
    "emailedAt" TIMESTAMP(3),
    "grossEarnings" DECIMAL(15,2),
    "totalDeductions" DECIMAL(15,2),
    "netPay" DECIMAL(15,2),
    "earnings" JSONB,
    "deductions" JSONB,
    "employerContributions" JSONB,
    "pfEmployee" DECIMAL(15,2),
    "pfEmployer" DECIMAL(15,2),
    "vpfAmount" DECIMAL(15,2),
    "esiEmployee" DECIMAL(15,2),
    "esiEmployer" DECIMAL(15,2),
    "ptAmount" DECIMAL(15,2),
    "tdsAmount" DECIMAL(15,2),
    "lwfEmployee" DECIMAL(15,2),
    "lwfEmployer" DECIMAL(15,2),
    "loanDeduction" DECIMAL(15,2),
    "overtimeAmount" DECIMAL(15,2),
    "workingDays" INTEGER,
    "presentDays" DECIMAL(5,1),
    "lopDays" DECIMAL(5,1),
    "tdsProvisional" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statutory_filings" (
    "id" TEXT NOT NULL,
    "type" "StatutoryFilingType" NOT NULL,
    "month" INTEGER,
    "year" INTEGER NOT NULL,
    "status" "StatutoryFilingStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(15,2),
    "fileUrl" TEXT,
    "filedAt" TIMESTAMP(3),
    "filedBy" TEXT,
    "dueDate" DATE,
    "details" JSONB,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statutory_filings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_holds" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "holdType" "SalaryHoldType" NOT NULL DEFAULT 'FULL',
    "reason" TEXT NOT NULL,
    "heldComponents" JSONB,
    "releasedAt" TIMESTAMP(3),
    "releasedBy" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_revisions" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "oldCtc" DECIMAL(15,2) NOT NULL,
    "newCtc" DECIMAL(15,2) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "incrementPercent" DECIMAL(5,2),
    "newComponents" JSONB,
    "arrearsComputed" BOOLEAN NOT NULL DEFAULT false,
    "totalArrears" DECIMAL(15,2),
    "revisionLetterUrl" TEXT,
    "status" "RevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arrear_entries" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT,
    "revisionId" TEXT,
    "employeeId" TEXT NOT NULL,
    "forMonth" INTEGER NOT NULL,
    "forYear" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arrear_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appraisal_cycles" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "name" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'ANNUAL',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "ratingScale" INTEGER NOT NULL DEFAULT 5,
    "ratingLabels" JSONB,
    "kraWeightage" DECIMAL(5,2) NOT NULL DEFAULT 70,
    "competencyWeightage" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "bellCurve" JSONB,
    "forcedDistribution" BOOLEAN NOT NULL DEFAULT false,
    "midYearReview" BOOLEAN NOT NULL DEFAULT false,
    "midYearMonth" INTEGER,
    "managerEditDays" INTEGER,
    "status" "AppraisalCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appraisal_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT,
    "departmentId" TEXT,
    "parentGoalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kpiMetric" TEXT,
    "targetValue" DECIMAL(10,2),
    "achievedValue" DECIMAL(10,2),
    "weightage" DECIMAL(5,2) NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "status" "GoalStatus" NOT NULL DEFAULT 'DRAFT',
    "selfRating" INTEGER,
    "managerRating" INTEGER,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appraisal_entries" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "selfRating" DECIMAL(3,1),
    "managerRating" DECIMAL(3,1),
    "skipLevelRating" DECIMAL(3,1),
    "finalRating" DECIMAL(3,1),
    "kraScore" DECIMAL(5,2),
    "competencyScore" DECIMAL(5,2),
    "selfComments" TEXT,
    "managerComments" TEXT,
    "promotionRecommended" BOOLEAN NOT NULL DEFAULT false,
    "incrementPercent" DECIMAL(5,2),
    "status" "AppraisalEntryStatus" NOT NULL DEFAULT 'PENDING',
    "publishedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appraisal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_360" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "raterType" "RaterType" NOT NULL,
    "ratings" JSONB NOT NULL,
    "strengths" TEXT,
    "improvements" TEXT,
    "wouldWorkAgain" BOOLEAN,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "submittedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_360_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_library" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_mappings" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "requiredLevel" INTEGER NOT NULL DEFAULT 3,
    "assessedAt" TIMESTAMP(3),
    "assessedBy" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "succession_plans" (
    "id" TEXT NOT NULL,
    "criticalRoleTitle" TEXT NOT NULL,
    "criticalRoleDesignationId" TEXT,
    "successorId" TEXT NOT NULL,
    "readiness" "SuccessorReadiness" NOT NULL DEFAULT 'NOT_READY',
    "developmentPlan" TEXT,
    "performanceRating" DECIMAL(3,1),
    "potentialRating" DECIMAL(3,1),
    "nineBoxPosition" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "succession_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_requisitions" (
    "id" TEXT NOT NULL,
    "requisitionNumber" TEXT,
    "title" TEXT NOT NULL,
    "designationId" TEXT,
    "departmentId" TEXT,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "budgetMin" DECIMAL(15,2),
    "budgetMax" DECIMAL(15,2),
    "targetDate" DATE,
    "sourceChannels" JSONB,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "employmentType" "EmploymentType",
    "priority" "RequisitionPriority",
    "location" TEXT,
    "requirements" TEXT,
    "experienceMin" INTEGER,
    "experienceMax" INTEGER,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "source" TEXT,
    "currentCtc" DECIMAL(15,2),
    "expectedCtc" DECIMAL(15,2),
    "resumeUrl" TEXT,
    "stage" "CandidateStage" NOT NULL DEFAULT 'APPLIED',
    "rating" DECIMAL(3,1),
    "notes" TEXT,
    "employeeId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "panelists" JSONB,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "meetingLink" TEXT,
    "feedbackRating" DECIMAL(3,1),
    "feedbackNotes" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_offers" (
    "id" TEXT NOT NULL,
    "offerNumber" TEXT,
    "candidateId" TEXT NOT NULL,
    "designationId" TEXT,
    "departmentId" TEXT,
    "offeredCtc" DECIMAL(15,2) NOT NULL,
    "ctcBreakup" JSONB,
    "joiningDate" DATE,
    "offerLetterUrl" TEXT,
    "validUntil" DATE,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_education" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "degree" TEXT,
    "institution" TEXT,
    "university" TEXT,
    "yearOfPassing" INTEGER,
    "percentage" DECIMAL(5,2),
    "certificateUrl" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_experience" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "fromDate" DATE,
    "toDate" DATE,
    "currentlyWorking" BOOLEAN NOT NULL DEFAULT false,
    "ctc" DECIMAL(15,2),
    "description" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_documents" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_evaluations" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comments" TEXT,
    "recommendation" "EvalRecommendation" NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_stage_history" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fromStage" "CandidateStage" NOT NULL,
    "toStage" "CandidateStage" NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "candidate_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_swap_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "currentShiftId" TEXT NOT NULL,
    "requestedShiftId" TEXT NOT NULL,
    "swapDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wfh_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "days" DECIMAL(5,1) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wfh_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_catalogues" (
    "id" TEXT NOT NULL,
    "catalogueNumber" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TECHNICAL',
    "mode" "TrainingMode" NOT NULL DEFAULT 'CLASSROOM',
    "duration" TEXT,
    "linkedSkillIds" JSONB,
    "proficiencyGain" INTEGER NOT NULL DEFAULT 1,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "certificationName" TEXT,
    "certificationBody" TEXT,
    "certificationValidity" INTEGER,
    "vendorProvider" TEXT,
    "costPerHead" DECIMAL(15,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_catalogues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_nominations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "status" "TrainingNominationStatus" NOT NULL DEFAULT 'NOMINATED',
    "completionDate" TIMESTAMP(3),
    "score" DECIMAL(5,2),
    "certificateUrl" TEXT,
    "certificateNumber" TEXT,
    "certificateIssuedAt" TIMESTAMP(3),
    "certificateExpiryDate" TIMESTAMP(3),
    "certificateStatus" "CertificateStatus",
    "sessionId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_nominations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "sessionNumber" TEXT,
    "trainingId" TEXT NOT NULL,
    "batchName" TEXT,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "meetingLink" TEXT,
    "maxParticipants" INTEGER,
    "trainerId" TEXT,
    "status" "TrainingSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancelledReason" TEXT,
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_attendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "nominationId" TEXT,
    "status" "TrainingAttendanceStatus" NOT NULL DEFAULT 'REGISTERED',
    "checkInTime" TIMESTAMP(3),
    "checkOutTime" TIMESTAMP(3),
    "hoursAttended" DECIMAL(4,1),
    "remarks" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_evaluations" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT,
    "nominationId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" "EvaluationType" NOT NULL,
    "contentRelevance" INTEGER,
    "trainerEffectiveness" INTEGER,
    "overallSatisfaction" INTEGER,
    "knowledgeGain" INTEGER,
    "practicalApplicability" INTEGER,
    "preAssessmentScore" DECIMAL(5,2),
    "postAssessmentScore" DECIMAL(5,2),
    "comments" TEXT,
    "improvementSuggestions" TEXT,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainers" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "externalName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "specializations" JSONB,
    "qualifications" TEXT,
    "experienceYears" INTEGER,
    "averageRating" DECIMAL(3,2),
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_programs" (
    "id" TEXT NOT NULL,
    "programNumber" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "level" TEXT,
    "totalDuration" TEXT,
    "isCompulsory" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_program_courses" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "isPrerequisite" BOOLEAN NOT NULL DEFAULT false,
    "minPassScore" DECIMAL(5,2),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_program_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_program_enrollments" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "ProgramEnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_program_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_budgets" (
    "id" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "departmentId" TEXT,
    "allocatedAmount" DECIMAL(15,2) NOT NULL,
    "usedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_materials" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "sequenceOrder" INTEGER,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_delegates" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "delegateId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manager_delegates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_transfers" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fromDepartmentId" TEXT,
    "toDepartmentId" TEXT,
    "fromDesignationId" TEXT,
    "toDesignationId" TEXT,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "fromManagerId" TEXT,
    "toManagerId" TEXT,
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "transferType" TEXT NOT NULL DEFAULT 'LATERAL',
    "status" "TransferStatus" NOT NULL DEFAULT 'REQUESTED',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "transferLetterUrl" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_promotions" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fromDesignationId" TEXT,
    "toDesignationId" TEXT NOT NULL,
    "fromGradeId" TEXT,
    "toGradeId" TEXT,
    "currentCtc" DECIMAL(15,2),
    "newCtc" DECIMAL(15,2),
    "incrementPercent" DECIMAL(5,2),
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT,
    "appraisalEntryId" TEXT,
    "status" "PromotionStatus" NOT NULL DEFAULT 'REQUESTED',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "promotionLetterUrl" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retentionDate" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'COMPANY_ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "companyId" TEXT,
    "employeeId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "active_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_users" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userTier" "UserTier" NOT NULL,
    "billingType" "BillingType" NOT NULL DEFAULT 'MONTHLY',
    "oneTimeLicenseFee" DOUBLE PRECISION,
    "amcAmount" DOUBLE PRECISION,
    "amcDueDate" TIMESTAMP(3),
    "amcStatus" "AmcStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "modules" JSONB NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT NOT NULL DEFAULT '',
    "invoiceType" "InvoiceType" NOT NULL DEFAULT 'SUBSCRIPTION',
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingPeriodStart" TIMESTAMP(3),
    "billingPeriodEnd" TIMESTAMP(3),
    "paidVia" "PaymentMethod",
    "paymentReference" TEXT,
    "sentAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "gstNotApplicable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "transactionReference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_billing_config" (
    "id" TEXT NOT NULL,
    "defaultOneTimeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "defaultAmcPercentage" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "defaultCgstRate" DOUBLE PRECISION NOT NULL DEFAULT 9,
    "defaultSgstRate" DOUBLE PRECISION NOT NULL DEFAULT 9,
    "defaultIgstRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "platformGstin" TEXT,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "nextInvoiceSeq" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_billing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "deviceName" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_registration_requests" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "RegistrationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "ticketId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "customDomain" TEXT,
    "dbStrategy" TEXT NOT NULL DEFAULT 'schema',
    "databaseUrl" TEXT,
    "companyId" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "size" "CompanySize" NOT NULL,
    "website" TEXT,
    "gstNumber" TEXT,
    "address" JSONB,
    "contactPerson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "displayName" TEXT,
    "legalName" TEXT,
    "shortName" TEXT,
    "businessType" TEXT,
    "companyCode" TEXT,
    "cin" TEXT,
    "incorporationDate" TEXT,
    "employeeCount" TEXT,
    "emailDomain" TEXT,
    "logoUrl" TEXT,
    "pan" TEXT,
    "tan" TEXT,
    "gstin" TEXT,
    "pfRegNo" TEXT,
    "esiCode" TEXT,
    "ptReg" TEXT,
    "lwfrNo" TEXT,
    "rocState" TEXT,
    "registeredAddress" JSONB,
    "corporateAddress" JSONB,
    "sameAsRegistered" BOOLEAN NOT NULL DEFAULT true,
    "fiscalConfig" JSONB,
    "razorpayConfig" JSONB,
    "endpointType" TEXT NOT NULL DEFAULT 'default',
    "customEndpointUrl" TEXT,
    "multiLocationMode" BOOLEAN NOT NULL DEFAULT false,
    "locationConfig" TEXT NOT NULL DEFAULT 'common',
    "selectedModuleIds" JSONB,
    "customModulePricing" JSONB,
    "userTier" TEXT,
    "customUserLimit" TEXT,
    "customTierPrice" TEXT,
    "billingType" TEXT DEFAULT 'monthly',
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "oneTimeMultiplier" DOUBLE PRECISION,
    "amcPercentage" DOUBLE PRECISION,
    "dayStartTime" TEXT,
    "dayEndTime" TEXT,
    "weeklyOffs" JSONB,
    "wizardStatus" TEXT NOT NULL DEFAULT 'Draft',

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL DEFAULT 'GENERAL',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToUserId" TEXT,
    "metadata" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderUserId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderRole" "SenderRole" NOT NULL DEFAULT 'COMPANY_ADMIN',
    "body" TEXT NOT NULL,
    "isSystemMessage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "geofences_companyId_idx" ON "geofences"("companyId");

-- CreateIndex
CREATE INDEX "geofences_locationId_idx" ON "geofences"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "geofences_locationId_name_key" ON "geofences"("locationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "locations_companyId_code_key" ON "locations"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "no_series_configs_companyId_code_key" ON "no_series_configs"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_companyId_key" ON "company_settings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "system_controls_companyId_key" ON "system_controls"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_devices_companyId_deviceId_key" ON "biometric_devices"("companyId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_rotation_schedules_companyId_name_key" ON "shift_rotation_schedules"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "shift_rotation_assignments_scheduleId_employeeId_key" ON "shift_rotation_assignments"("scheduleId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "data_retention_policies_companyId_dataCategory_key" ON "data_retention_policies"("companyId", "dataCategory");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_employeeId_consentType_key" ON "consent_records"("employeeId", "consentType");

-- CreateIndex
CREATE INDEX "employee_analytics_daily_companyId_date_idx" ON "employee_analytics_daily"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_analytics_daily_companyId_date_version_key" ON "employee_analytics_daily"("companyId", "date", "version");

-- CreateIndex
CREATE INDEX "attendance_analytics_daily_companyId_date_idx" ON "attendance_analytics_daily"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_analytics_daily_companyId_date_version_key" ON "attendance_analytics_daily"("companyId", "date", "version");

-- CreateIndex
CREATE INDEX "payroll_analytics_monthly_companyId_year_month_idx" ON "payroll_analytics_monthly"("companyId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_analytics_monthly_companyId_month_year_version_key" ON "payroll_analytics_monthly"("companyId", "month", "year", "version");

-- CreateIndex
CREATE INDEX "attrition_metrics_monthly_companyId_year_month_idx" ON "attrition_metrics_monthly"("companyId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "attrition_metrics_monthly_companyId_month_year_version_key" ON "attrition_metrics_monthly"("companyId", "month", "year", "version");

-- CreateIndex
CREATE INDEX "analytics_alerts_companyId_status_severity_idx" ON "analytics_alerts"("companyId", "status", "severity");

-- CreateIndex
CREATE INDEX "analytics_alerts_companyId_dashboard_idx" ON "analytics_alerts"("companyId", "dashboard");

-- CreateIndex
CREATE INDEX "analytics_audit_logs_companyId_userId_createdAt_idx" ON "analytics_audit_logs"("companyId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_audit_logs_companyId_action_createdAt_idx" ON "analytics_audit_logs"("companyId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "report_history_companyId_generatedAt_idx" ON "report_history"("companyId", "generatedAt");

-- CreateIndex
CREATE INDEX "report_history_companyId_reportType_idx" ON "report_history"("companyId", "reportType");

-- CreateIndex
CREATE INDEX "report_history_companyId_userId_idx" ON "report_history"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_companyId_name_key" ON "asset_categories"("companyId", "name");

-- CreateIndex
CREATE INDEX "attendance_records_companyId_date_idx" ON "attendance_records"("companyId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_companyId_status_idx" ON "attendance_records"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employeeId_date_key" ON "attendance_records"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_rules_companyId_key" ON "attendance_rules"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_calendars_companyId_name_date_key" ON "holiday_calendars"("companyId", "name", "date");

-- CreateIndex
CREATE UNIQUE INDEX "rosters_companyId_name_key" ON "rosters"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_rules_companyId_key" ON "overtime_rules"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_attendanceRecordId_key" ON "overtime_requests"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "overtime_requests_companyId_status_idx" ON "overtime_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "overtime_requests_employeeId_date_idx" ON "overtime_requests"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_employeeId_key" ON "employees"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ess_configs_companyId_key" ON "ess_configs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflows_companyId_triggerEvent_key" ON "approval_workflows"("companyId", "triggerEvent");

-- CreateIndex
CREATE INDEX "approval_requests_companyId_status_idx" ON "approval_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "approval_requests_companyId_status_entityType_idx" ON "approval_requests"("companyId", "status", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "it_declarations_employeeId_financialYear_key" ON "it_declarations"("employeeId", "financialYear");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_companyId_code_key" ON "expense_categories"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "expense_category_limits_categoryId_gradeId_designationId_key" ON "expense_category_limits"("categoryId", "gradeId", "designationId");

-- CreateIndex
CREATE INDEX "expense_claims_companyId_status_idx" ON "expense_claims"("companyId", "status");

-- CreateIndex
CREATE INDEX "expense_claims_employeeId_status_idx" ON "expense_claims"("employeeId", "status");

-- CreateIndex
CREATE INDEX "expense_claims_companyId_employeeId_idx" ON "expense_claims"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "grievance_categories_companyId_name_key" ON "grievance_categories"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_companyId_code_key" ON "leave_types"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employeeId_leaveTypeId_year_key" ON "leave_balances"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "exit_interviews_exitRequestId_key" ON "exit_interviews"("exitRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "fnf_settlements_exitRequestId_key" ON "fnf_settlements"("exitRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_templates_companyId_name_key" ON "onboarding_templates"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "probation_reviews_employeeId_probationEndDate_key" ON "probation_reviews"("employeeId", "probationEndDate");

-- CreateIndex
CREATE UNIQUE INDEX "departments_companyId_code_key" ON "departments"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "designations_companyId_code_key" ON "designations"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "grades_companyId_code_key" ON "grades"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "employee_types_companyId_code_key" ON "employee_types"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centres_companyId_code_key" ON "cost_centres"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "salary_components_companyId_code_key" ON "salary_components"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_companyId_code_key" ON "salary_structures"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "pf_configs_companyId_key" ON "pf_configs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "esi_configs_companyId_key" ON "esi_configs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "pt_configs_companyId_state_key" ON "pt_configs"("companyId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "gratuity_configs_companyId_key" ON "gratuity_configs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "bonus_configs_companyId_key" ON "bonus_configs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "lwf_configs_companyId_state_key" ON "lwf_configs"("companyId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "bank_configs_companyId_key" ON "bank_configs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "loan_policies_companyId_code_key" ON "loan_policies"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "tax_configs_companyId_key" ON "tax_configs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_companyId_month_year_key" ON "payroll_runs"("companyId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_entries_payrollRunId_employeeId_key" ON "payroll_entries"("payrollRunId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_employeeId_month_year_key" ON "payslips"("employeeId", "month", "year");

-- CreateIndex
CREATE INDEX "goals_cycleId_employeeId_idx" ON "goals"("cycleId", "employeeId");

-- CreateIndex
CREATE INDEX "goals_companyId_level_idx" ON "goals"("companyId", "level");

-- CreateIndex
CREATE INDEX "appraisal_entries_cycleId_status_idx" ON "appraisal_entries"("cycleId", "status");

-- CreateIndex
CREATE INDEX "appraisal_entries_companyId_cycleId_idx" ON "appraisal_entries"("companyId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "appraisal_entries_cycleId_employeeId_key" ON "appraisal_entries"("cycleId", "employeeId");

-- CreateIndex
CREATE INDEX "feedback_360_cycleId_employeeId_idx" ON "feedback_360"("cycleId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_360_cycleId_employeeId_raterId_key" ON "feedback_360"("cycleId", "employeeId", "raterId");

-- CreateIndex
CREATE UNIQUE INDEX "skill_library_companyId_name_key" ON "skill_library"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "skill_mappings_employeeId_skillId_key" ON "skill_mappings"("employeeId", "skillId");

-- CreateIndex
CREATE INDEX "policy_documents_companyId_isActive_idx" ON "policy_documents"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "job_requisitions_companyId_status_idx" ON "job_requisitions"("companyId", "status");

-- CreateIndex
CREATE INDEX "candidates_companyId_stage_idx" ON "candidates"("companyId", "stage");

-- CreateIndex
CREATE INDEX "candidates_requisitionId_stage_idx" ON "candidates"("requisitionId", "stage");

-- CreateIndex
CREATE INDEX "candidates_email_idx" ON "candidates"("email");

-- CreateIndex
CREATE INDEX "interviews_companyId_status_idx" ON "interviews"("companyId", "status");

-- CreateIndex
CREATE INDEX "interviews_candidateId_status_idx" ON "interviews"("candidateId", "status");

-- CreateIndex
CREATE INDEX "interviews_scheduledAt_idx" ON "interviews"("scheduledAt");

-- CreateIndex
CREATE INDEX "candidate_offers_companyId_status_idx" ON "candidate_offers"("companyId", "status");

-- CreateIndex
CREATE INDEX "candidate_offers_candidateId_idx" ON "candidate_offers"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_education_candidateId_idx" ON "candidate_education"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_experience_candidateId_idx" ON "candidate_experience"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_documents_candidateId_idx" ON "candidate_documents"("candidateId");

-- CreateIndex
CREATE INDEX "interview_evaluations_interviewId_idx" ON "interview_evaluations"("interviewId");

-- CreateIndex
CREATE INDEX "candidate_stage_history_candidateId_idx" ON "candidate_stage_history"("candidateId");

-- CreateIndex
CREATE INDEX "shift_swap_requests_companyId_employeeId_idx" ON "shift_swap_requests"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "shift_swap_requests_companyId_status_idx" ON "shift_swap_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "wfh_requests_companyId_employeeId_idx" ON "wfh_requests"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "wfh_requests_companyId_status_idx" ON "wfh_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "training_catalogues_companyId_isActive_idx" ON "training_catalogues"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "training_nominations_companyId_status_idx" ON "training_nominations"("companyId", "status");

-- CreateIndex
CREATE INDEX "training_nominations_employeeId_status_idx" ON "training_nominations"("employeeId", "status");

-- CreateIndex
CREATE INDEX "training_sessions_companyId_status_idx" ON "training_sessions"("companyId", "status");

-- CreateIndex
CREATE INDEX "training_sessions_trainingId_idx" ON "training_sessions"("trainingId");

-- CreateIndex
CREATE INDEX "training_sessions_trainerId_idx" ON "training_sessions"("trainerId");

-- CreateIndex
CREATE INDEX "training_attendance_sessionId_idx" ON "training_attendance"("sessionId");

-- CreateIndex
CREATE INDEX "training_attendance_employeeId_idx" ON "training_attendance"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "training_attendance_sessionId_employeeId_key" ON "training_attendance"("sessionId", "employeeId");

-- CreateIndex
CREATE INDEX "training_evaluations_nominationId_idx" ON "training_evaluations"("nominationId");

-- CreateIndex
CREATE INDEX "training_evaluations_sessionId_idx" ON "training_evaluations"("sessionId");

-- CreateIndex
CREATE INDEX "trainers_companyId_isActive_idx" ON "trainers"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "training_programs_companyId_isActive_idx" ON "training_programs"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "training_program_courses_programId_idx" ON "training_program_courses"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "training_program_courses_programId_trainingId_key" ON "training_program_courses"("programId", "trainingId");

-- CreateIndex
CREATE INDEX "training_program_enrollments_programId_idx" ON "training_program_enrollments"("programId");

-- CreateIndex
CREATE INDEX "training_program_enrollments_employeeId_idx" ON "training_program_enrollments"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "training_program_enrollments_programId_employeeId_key" ON "training_program_enrollments"("programId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "training_budgets_fiscalYear_companyId_departmentId_key" ON "training_budgets"("fiscalYear", "companyId", "departmentId");

-- CreateIndex
CREATE INDEX "training_materials_trainingId_idx" ON "training_materials"("trainingId");

-- CreateIndex
CREATE INDEX "analytics_snapshots_companyId_snapshotType_idx" ON "analytics_snapshots"("companyId", "snapshotType");

-- CreateIndex
CREATE INDEX "analytics_snapshots_createdAt_idx" ON "analytics_snapshots"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_entityType_entityId_idx" ON "audit_logs"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_changedBy_idx" ON "audit_logs"("changedBy");

-- CreateIndex
CREATE INDEX "audit_logs_retentionDate_idx" ON "audit_logs"("retentionDate");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "active_sessions_refreshToken_key" ON "active_sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "active_sessions_userId_idx" ON "active_sessions"("userId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "roles_tenantId_idx" ON "roles"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_name_key" ON "roles"("tenantId", "name");

-- CreateIndex
CREATE INDEX "tenant_users_tenantId_idx" ON "tenant_users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_users_userId_tenantId_key" ON "tenant_users"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_key" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_companyId_createdAt_idx" ON "notifications"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "user_devices_userId_idx" ON "user_devices"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_userId_fcmToken_key" ON "user_devices"("userId", "fcmToken");

-- CreateIndex
CREATE UNIQUE INDEX "company_registration_requests_email_key" ON "company_registration_requests"("email");

-- CreateIndex
CREATE UNIQUE INDEX "company_registration_requests_ticketId_key" ON "company_registration_requests"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_schemaName_key" ON "tenants"("schemaName");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_customDomain_key" ON "tenants"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_companyId_key" ON "tenants"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_gstNumber_key" ON "companies"("gstNumber");

-- CreateIndex
CREATE UNIQUE INDEX "companies_companyCode_key" ON "companies"("companyCode");

-- CreateIndex
CREATE INDEX "support_tickets_tenantId_idx" ON "support_tickets"("tenantId");

-- CreateIndex
CREATE INDEX "support_tickets_companyId_idx" ON "support_tickets"("companyId");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_tickets_category_idx" ON "support_tickets"("category");

-- CreateIndex
CREATE INDEX "support_messages_ticketId_idx" ON "support_messages"("ticketId");

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "no_series_configs" ADD CONSTRAINT "no_series_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_reasons" ADD CONSTRAINT "iot_reasons_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_controls" ADD CONSTRAINT "system_controls_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_shifts" ADD CONSTRAINT "company_shifts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_breaks" ADD CONSTRAINT "shift_breaks_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "company_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_devices" ADD CONSTRAINT "biometric_devices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_rotation_schedules" ADD CONSTRAINT "shift_rotation_schedules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_rotation_assignments" ADD CONSTRAINT "shift_rotation_assignments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "shift_rotation_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_rotation_assignments" ADD CONSTRAINT "shift_rotation_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_rotation_assignments" ADD CONSTRAINT "shift_rotation_assignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_incentive_configs" ADD CONSTRAINT "production_incentive_configs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_incentive_configs" ADD CONSTRAINT "production_incentive_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_incentive_records" ADD CONSTRAINT "production_incentive_records_configId_fkey" FOREIGN KEY ("configId") REFERENCES "production_incentive_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_incentive_records" ADD CONSTRAINT "production_incentive_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_incentive_records" ADD CONSTRAINT "production_incentive_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_access_requests" ADD CONSTRAINT "data_access_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_access_requests" ADD CONSTRAINT "data_access_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_analytics_daily" ADD CONSTRAINT "employee_analytics_daily_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_analytics_daily" ADD CONSTRAINT "attendance_analytics_daily_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_analytics_monthly" ADD CONSTRAINT "payroll_analytics_monthly_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attrition_metrics_monthly" ADD CONSTRAINT "attrition_metrics_monthly_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_alerts" ADD CONSTRAINT "analytics_alerts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_history" ADD CONSTRAINT "report_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "company_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_overrides" ADD CONSTRAINT "attendance_overrides_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_overrides" ADD CONSTRAINT "attendance_overrides_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_rules" ADD CONSTRAINT "attendance_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_calendars" ADD CONSTRAINT "holiday_calendars_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_rules" ADD CONSTRAINT "overtime_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_overtimeRuleId_fkey" FOREIGN KEY ("overtimeRuleId") REFERENCES "overtime_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_employeeTypeId_fkey" FOREIGN KEY ("employeeTypeId") REFERENCES "employee_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_functionalManagerId_fkey" FOREIGN KEY ("functionalManagerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "company_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "cost_centres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "geofences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_nominees" ADD CONSTRAINT "employee_nominees_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_education" ADD CONSTRAINT "employee_education_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_prev_employments" ADD CONSTRAINT "employee_prev_employments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_timeline" ADD CONSTRAINT "employee_timeline_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ess_configs" ADD CONSTRAINT "ess_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_declarations" ADD CONSTRAINT "it_declarations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_declarations" ADD CONSTRAINT "it_declarations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_category_limits" ADD CONSTRAINT "expense_category_limits_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_category_limits" ADD CONSTRAINT "expense_category_limits_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_category_limits" ADD CONSTRAINT "expense_category_limits_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_category_limits" ADD CONSTRAINT "expense_category_limits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claim_items" ADD CONSTRAINT "expense_claim_items_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "expense_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claim_items" ADD CONSTRAINT "expense_claim_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_letter_templates" ADD CONSTRAINT "hr_letter_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_letters" ADD CONSTRAINT "hr_letters_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "hr_letter_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_letters" ADD CONSTRAINT "hr_letters_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_letters" ADD CONSTRAINT "hr_letters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grievance_categories" ADD CONSTRAINT "grievance_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grievance_cases" ADD CONSTRAINT "grievance_cases_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grievance_cases" ADD CONSTRAINT "grievance_cases_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "grievance_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grievance_cases" ADD CONSTRAINT "grievance_cases_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_actions" ADD CONSTRAINT "disciplinary_actions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_actions" ADD CONSTRAINT "disciplinary_actions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_requests" ADD CONSTRAINT "exit_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_requests" ADD CONSTRAINT "exit_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_clearances" ADD CONSTRAINT "exit_clearances_exitRequestId_fkey" FOREIGN KEY ("exitRequestId") REFERENCES "exit_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_clearances" ADD CONSTRAINT "exit_clearances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_interviews" ADD CONSTRAINT "exit_interviews_exitRequestId_fkey" FOREIGN KEY ("exitRequestId") REFERENCES "exit_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_interviews" ADD CONSTRAINT "exit_interviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fnf_settlements" ADD CONSTRAINT "fnf_settlements_exitRequestId_fkey" FOREIGN KEY ("exitRequestId") REFERENCES "exit_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fnf_settlements" ADD CONSTRAINT "fnf_settlements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fnf_settlements" ADD CONSTRAINT "fnf_settlements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "onboarding_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probation_reviews" ADD CONSTRAINT "probation_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probation_reviews" ADD CONSTRAINT "probation_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_batches" ADD CONSTRAINT "bonus_batches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_batch_items" ADD CONSTRAINT "bonus_batch_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "bonus_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_batch_items" ADD CONSTRAINT "bonus_batch_items_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_batch_items" ADD CONSTRAINT "bonus_batch_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_types" ADD CONSTRAINT "employee_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centres" ADD CONSTRAINT "cost_centres_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centres" ADD CONSTRAINT "cost_centres_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centres" ADD CONSTRAINT "cost_centres_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "salary_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pf_configs" ADD CONSTRAINT "pf_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esi_configs" ADD CONSTRAINT "esi_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_configs" ADD CONSTRAINT "pt_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gratuity_configs" ADD CONSTRAINT "gratuity_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_configs" ADD CONSTRAINT "bonus_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lwf_configs" ADD CONSTRAINT "lwf_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_configs" ADD CONSTRAINT "bank_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_policies" ADD CONSTRAINT "loan_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_records" ADD CONSTRAINT "loan_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_records" ADD CONSTRAINT "loan_records_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "loan_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_records" ADD CONSTRAINT "loan_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_configs" ADD CONSTRAINT "tax_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statutory_filings" ADD CONSTRAINT "statutory_filings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_holds" ADD CONSTRAINT "salary_holds_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_holds" ADD CONSTRAINT "salary_holds_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_holds" ADD CONSTRAINT "salary_holds_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_revisions" ADD CONSTRAINT "salary_revisions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_revisions" ADD CONSTRAINT "salary_revisions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrear_entries" ADD CONSTRAINT "arrear_entries_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrear_entries" ADD CONSTRAINT "arrear_entries_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "salary_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrear_entries" ADD CONSTRAINT "arrear_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrear_entries" ADD CONSTRAINT "arrear_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisal_cycles" ADD CONSTRAINT "appraisal_cycles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "appraisal_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_parentGoalId_fkey" FOREIGN KEY ("parentGoalId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisal_entries" ADD CONSTRAINT "appraisal_entries_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "appraisal_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisal_entries" ADD CONSTRAINT "appraisal_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisal_entries" ADD CONSTRAINT "appraisal_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_360" ADD CONSTRAINT "feedback_360_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "appraisal_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_360" ADD CONSTRAINT "feedback_360_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_360" ADD CONSTRAINT "feedback_360_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_360" ADD CONSTRAINT "feedback_360_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_library" ADD CONSTRAINT "skill_library_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_mappings" ADD CONSTRAINT "skill_mappings_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_mappings" ADD CONSTRAINT "skill_mappings_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_library"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_mappings" ADD CONSTRAINT "skill_mappings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "succession_plans" ADD CONSTRAINT "succession_plans_criticalRoleDesignationId_fkey" FOREIGN KEY ("criticalRoleDesignationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "succession_plans" ADD CONSTRAINT "succession_plans_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "succession_plans" ADD CONSTRAINT "succession_plans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "job_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_offers" ADD CONSTRAINT "candidate_offers_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_offers" ADD CONSTRAINT "candidate_offers_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_offers" ADD CONSTRAINT "candidate_offers_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_offers" ADD CONSTRAINT "candidate_offers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_stage_history" ADD CONSTRAINT "candidate_stage_history_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_stage_history" ADD CONSTRAINT "candidate_stage_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wfh_requests" ADD CONSTRAINT "wfh_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wfh_requests" ADD CONSTRAINT "wfh_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_catalogues" ADD CONSTRAINT "training_catalogues_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_nominations" ADD CONSTRAINT "training_nominations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_nominations" ADD CONSTRAINT "training_nominations_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_catalogues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_nominations" ADD CONSTRAINT "training_nominations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_nominations" ADD CONSTRAINT "training_nominations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_catalogues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "training_nominations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_evaluations" ADD CONSTRAINT "training_evaluations_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_catalogues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_evaluations" ADD CONSTRAINT "training_evaluations_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "training_nominations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_evaluations" ADD CONSTRAINT "training_evaluations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_evaluations" ADD CONSTRAINT "training_evaluations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_courses" ADD CONSTRAINT "training_program_courses_programId_fkey" FOREIGN KEY ("programId") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_courses" ADD CONSTRAINT "training_program_courses_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_catalogues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_courses" ADD CONSTRAINT "training_program_courses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_enrollments" ADD CONSTRAINT "training_program_enrollments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_enrollments" ADD CONSTRAINT "training_program_enrollments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_enrollments" ADD CONSTRAINT "training_program_enrollments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_budgets" ADD CONSTRAINT "training_budgets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_budgets" ADD CONSTRAINT "training_budgets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_materials" ADD CONSTRAINT "training_materials_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_catalogues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_materials" ADD CONSTRAINT "training_materials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_delegates" ADD CONSTRAINT "manager_delegates_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_delegates" ADD CONSTRAINT "manager_delegates_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_delegates" ADD CONSTRAINT "manager_delegates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_fromDesignationId_fkey" FOREIGN KEY ("fromDesignationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_toDesignationId_fkey" FOREIGN KEY ("toDesignationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_promotions" ADD CONSTRAINT "employee_promotions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_promotions" ADD CONSTRAINT "employee_promotions_fromDesignationId_fkey" FOREIGN KEY ("fromDesignationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_promotions" ADD CONSTRAINT "employee_promotions_toDesignationId_fkey" FOREIGN KEY ("toDesignationId") REFERENCES "designations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_promotions" ADD CONSTRAINT "employee_promotions_fromGradeId_fkey" FOREIGN KEY ("fromGradeId") REFERENCES "grades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_promotions" ADD CONSTRAINT "employee_promotions_toGradeId_fkey" FOREIGN KEY ("toGradeId") REFERENCES "grades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_promotions" ADD CONSTRAINT "employee_promotions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_registration_requests" ADD CONSTRAINT "company_registration_requests_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
