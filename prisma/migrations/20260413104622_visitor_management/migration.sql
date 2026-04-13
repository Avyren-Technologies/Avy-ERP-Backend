-- CreateEnum
CREATE TYPE "VisitPurpose" AS ENUM ('MEETING', 'DELIVERY', 'MAINTENANCE', 'AUDIT', 'INTERVIEW', 'SITE_TOUR', 'PERSONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RegistrationMethod" AS ENUM ('PRE_REGISTERED', 'QR_SELF_REG', 'WALK_IN');

-- CreateEnum
CREATE TYPE "VisitApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('EXPECTED', 'ARRIVED', 'CHECKED_IN', 'CHECKED_OUT', 'NO_SHOW', 'CANCELLED', 'REJECTED', 'AUTO_CHECKED_OUT');

-- CreateEnum
CREATE TYPE "BadgeFormat" AS ENUM ('DIGITAL', 'PRINTED');

-- CreateEnum
CREATE TYPE "InductionStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CheckOutMethod" AS ENUM ('SECURITY_DESK', 'HOST_INITIATED', 'MOBILE_LINK', 'AUTO_CHECKOUT');

-- CreateEnum
CREATE TYPE "SafetyInductionType" AS ENUM ('VIDEO', 'SLIDES', 'QUESTIONNAIRE', 'DECLARATION');

-- CreateEnum
CREATE TYPE "GateType" AS ENUM ('MAIN', 'SERVICE', 'LOADING_DOCK', 'VIP');

-- CreateEnum
CREATE TYPE "WatchlistType" AS ENUM ('BLOCKLIST', 'WATCHLIST');

-- CreateEnum
CREATE TYPE "WatchlistDuration" AS ENUM ('PERMANENT', 'UNTIL_DATE');

-- CreateEnum
CREATE TYPE "GroupVisitStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GroupMemberStatus" AS ENUM ('EXPECTED', 'CHECKED_IN', 'CHECKED_OUT', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "RecurringPassType" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "RecurringPassStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'TWO_WHEELER', 'AUTO', 'TRUCK', 'VAN', 'TEMPO', 'BUS');

-- CreateEnum
CREATE TYPE "MaterialGatePassType" AS ENUM ('INWARD', 'OUTWARD', 'RETURNABLE');

-- CreateEnum
CREATE TYPE "MaterialReturnStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING_RETURN', 'PARTIAL', 'FULLY_RETURNED');

-- CreateEnum
CREATE TYPE "ConfigRequirement" AS ENUM ('ALWAYS', 'PER_VISITOR_TYPE', 'NEVER');

-- CreateEnum
CREATE TYPE "DenialReason" AS ENUM ('BLOCKLIST_MATCH', 'HOST_REJECTED', 'INDUCTION_FAILED', 'GATE_CLOSED', 'WRONG_DATE', 'WRONG_GATE', 'PASS_EXPIRED', 'APPROVAL_TIMEOUT', 'MANUAL_DENIAL', 'VISIT_CANCELLED');

-- AlterTable
ALTER TABLE "system_controls" ADD COLUMN     "visitorEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "visitor_types" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "badgeColour" TEXT NOT NULL DEFAULT '#3B82F6',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requirePhoto" BOOLEAN NOT NULL DEFAULT true,
    "requireIdVerification" BOOLEAN NOT NULL DEFAULT true,
    "requireSafetyInduction" BOOLEAN NOT NULL DEFAULT false,
    "requireNda" BOOLEAN NOT NULL DEFAULT false,
    "requireHostApproval" BOOLEAN NOT NULL DEFAULT true,
    "requireEscort" BOOLEAN NOT NULL DEFAULT false,
    "defaultMaxDurationMinutes" INTEGER DEFAULT 480,
    "safetyInductionId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_gates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "GateType" NOT NULL DEFAULT 'MAIN',
    "openTime" TEXT,
    "closeTime" TEXT,
    "allowedVisitorTypeIds" TEXT[],
    "qrPosterUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_gates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_inductions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SafetyInductionType" NOT NULL,
    "contentUrl" TEXT,
    "questions" JSONB,
    "passingScore" INTEGER DEFAULT 80,
    "durationSeconds" INTEGER DEFAULT 120,
    "validityDays" INTEGER DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "plantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_inductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "visitNumber" TEXT NOT NULL,
    "visitCode" TEXT NOT NULL,
    "qrCodeUrl" TEXT,
    "visitorName" TEXT NOT NULL,
    "visitorMobile" TEXT NOT NULL,
    "visitorEmail" TEXT,
    "visitorCompany" TEXT,
    "visitorDesignation" TEXT,
    "visitorPhoto" TEXT,
    "governmentIdType" TEXT,
    "governmentIdNumber" TEXT,
    "idDocumentPhoto" TEXT,
    "visitorTypeId" TEXT NOT NULL,
    "purpose" "VisitPurpose" NOT NULL,
    "purposeNotes" TEXT,
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "expectedTime" TEXT,
    "expectedDurationMinutes" INTEGER,
    "hostEmployeeId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "gateId" TEXT,
    "registrationMethod" "RegistrationMethod" NOT NULL,
    "approvalStatus" "VisitApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvalTimestamp" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "checkInTime" TIMESTAMP(3),
    "checkInGateId" TEXT,
    "checkInGuardId" TEXT,
    "badgeNumber" TEXT,
    "badgeFormat" "BadgeFormat",
    "safetyInductionStatus" "InductionStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "safetyInductionScore" INTEGER,
    "safetyInductionTimestamp" TIMESTAMP(3),
    "ndaSigned" BOOLEAN NOT NULL DEFAULT false,
    "ndaDocumentUrl" TEXT,
    "ppeIssued" JSONB,
    "checkOutTime" TIMESTAMP(3),
    "checkOutGateId" TEXT,
    "checkOutMethod" "CheckOutMethod",
    "badgeReturned" BOOLEAN,
    "materialOut" TEXT,
    "visitDurationMinutes" INTEGER,
    "originalDurationMinutes" INTEGER,
    "extensionCount" INTEGER NOT NULL DEFAULT 0,
    "lastExtendedAt" TIMESTAMP(3),
    "lastExtendedBy" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'EXPECTED',
    "vehicleRegNumber" TEXT,
    "vehicleType" TEXT,
    "materialCarriedIn" TEXT,
    "specialInstructions" TEXT,
    "emergencyContact" TEXT,
    "groupVisitId" TEXT,
    "recurringPassId" TEXT,
    "purchaseOrderRef" TEXT,
    "meetingRef" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_watchlists" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "WatchlistType" NOT NULL,
    "personName" TEXT NOT NULL,
    "mobileNumber" TEXT,
    "email" TEXT,
    "idNumber" TEXT,
    "photo" TEXT,
    "reason" TEXT NOT NULL,
    "actionRequired" TEXT,
    "blockDuration" "WatchlistDuration" NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "appliesToAllPlants" BOOLEAN NOT NULL DEFAULT true,
    "plantIds" TEXT[],
    "createdBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_visits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "visitCode" TEXT NOT NULL,
    "qrCode" TEXT,
    "hostEmployeeId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "expectedTime" TEXT,
    "plantId" TEXT NOT NULL,
    "gateId" TEXT,
    "totalMembers" INTEGER NOT NULL,
    "status" "GroupVisitStatus" NOT NULL DEFAULT 'PLANNED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_visit_members" (
    "id" TEXT NOT NULL,
    "groupVisitId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "visitorMobile" TEXT NOT NULL,
    "visitorEmail" TEXT,
    "visitorCompany" TEXT,
    "visitId" TEXT,
    "status" "GroupMemberStatus" NOT NULL DEFAULT 'EXPECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_visit_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_visitor_passes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "passNumber" TEXT NOT NULL,
    "qrCode" TEXT,
    "visitorName" TEXT NOT NULL,
    "visitorCompany" TEXT NOT NULL,
    "visitorMobile" TEXT NOT NULL,
    "visitorEmail" TEXT,
    "visitorPhoto" TEXT,
    "visitorIdType" TEXT,
    "visitorIdNumber" TEXT,
    "passType" "RecurringPassType" NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "allowedDays" INTEGER[],
    "allowedTimeFrom" TEXT,
    "allowedTimeTo" TEXT,
    "allowedGateIds" TEXT[],
    "hostEmployeeId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "status" "RecurringPassStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokeReason" TEXT,
    "safetyInductionCompletedAt" TIMESTAMP(3),
    "safetyInductionValidUntil" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_visitor_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_gate_passes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "passNumber" TEXT NOT NULL,
    "vehicleRegNumber" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverMobile" TEXT,
    "purpose" TEXT NOT NULL,
    "visitId" TEXT,
    "materialDescription" TEXT,
    "vehiclePhoto" TEXT,
    "entryGateId" TEXT NOT NULL,
    "exitGateId" TEXT,
    "entryTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitTime" TIMESTAMP(3),
    "plantId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_gate_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_gate_passes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "passNumber" TEXT NOT NULL,
    "type" "MaterialGatePassType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantityIssued" TEXT,
    "quantityReturned" TEXT,
    "visitId" TEXT,
    "authorizedBy" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expectedReturnDate" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "returnStatus" "MaterialReturnStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "gateId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_gate_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_management_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "preRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "qrSelfRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "walkInAllowed" BOOLEAN NOT NULL DEFAULT true,
    "photoCapture" "ConfigRequirement" NOT NULL DEFAULT 'PER_VISITOR_TYPE',
    "idVerification" "ConfigRequirement" NOT NULL DEFAULT 'PER_VISITOR_TYPE',
    "safetyInduction" "ConfigRequirement" NOT NULL DEFAULT 'PER_VISITOR_TYPE',
    "ndaRequired" "ConfigRequirement" NOT NULL DEFAULT 'PER_VISITOR_TYPE',
    "badgePrintingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digitalBadgeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "walkInApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
    "qrSelfRegApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
    "approvalTimeoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "autoRejectAfterMinutes" INTEGER NOT NULL DEFAULT 30,
    "overstayAlertEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultMaxDurationMinutes" INTEGER NOT NULL DEFAULT 480,
    "autoCheckOutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoCheckOutTime" TEXT NOT NULL DEFAULT '20:00',
    "vehicleGatePassEnabled" BOOLEAN NOT NULL DEFAULT true,
    "materialGatePassEnabled" BOOLEAN NOT NULL DEFAULT true,
    "recurringPassEnabled" BOOLEAN NOT NULL DEFAULT true,
    "groupVisitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emergencyMusterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "privacyConsentText" TEXT,
    "checkInStepsOrder" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_management_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "denied_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "visitorMobile" TEXT,
    "visitorCompany" TEXT,
    "visitorPhoto" TEXT,
    "denialReason" "DenialReason" NOT NULL,
    "denialDetails" TEXT,
    "visitId" TEXT,
    "watchlistId" TEXT,
    "gateId" TEXT,
    "plantId" TEXT NOT NULL,
    "deniedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deniedBy" TEXT NOT NULL,
    "matchedField" TEXT,
    "matchedValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "denied_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visitor_types_companyId_isActive_idx" ON "visitor_types"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_types_companyId_code_key" ON "visitor_types"("companyId", "code");

-- CreateIndex
CREATE INDEX "visitor_gates_companyId_plantId_isActive_idx" ON "visitor_gates"("companyId", "plantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_gates_companyId_code_key" ON "visitor_gates"("companyId", "code");

-- CreateIndex
CREATE INDEX "safety_inductions_companyId_isActive_idx" ON "safety_inductions"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "visits_visitNumber_key" ON "visits"("visitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "visits_visitCode_key" ON "visits"("visitCode");

-- CreateIndex
CREATE INDEX "visits_companyId_status_idx" ON "visits"("companyId", "status");

-- CreateIndex
CREATE INDEX "visits_companyId_expectedDate_idx" ON "visits"("companyId", "expectedDate");

-- CreateIndex
CREATE INDEX "visits_companyId_hostEmployeeId_idx" ON "visits"("companyId", "hostEmployeeId");

-- CreateIndex
CREATE INDEX "visits_companyId_visitorMobile_idx" ON "visits"("companyId", "visitorMobile");

-- CreateIndex
CREATE INDEX "visits_visitCode_idx" ON "visits"("visitCode");

-- CreateIndex
CREATE INDEX "visitor_watchlists_companyId_type_isActive_idx" ON "visitor_watchlists"("companyId", "type", "isActive");

-- CreateIndex
CREATE INDEX "visitor_watchlists_companyId_mobileNumber_idx" ON "visitor_watchlists"("companyId", "mobileNumber");

-- CreateIndex
CREATE INDEX "visitor_watchlists_companyId_idNumber_idx" ON "visitor_watchlists"("companyId", "idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "group_visits_visitCode_key" ON "group_visits"("visitCode");

-- CreateIndex
CREATE INDEX "group_visits_companyId_status_idx" ON "group_visits"("companyId", "status");

-- CreateIndex
CREATE INDEX "group_visits_companyId_expectedDate_idx" ON "group_visits"("companyId", "expectedDate");

-- CreateIndex
CREATE UNIQUE INDEX "group_visit_members_visitId_key" ON "group_visit_members"("visitId");

-- CreateIndex
CREATE INDEX "group_visit_members_groupVisitId_status_idx" ON "group_visit_members"("groupVisitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_visitor_passes_passNumber_key" ON "recurring_visitor_passes"("passNumber");

-- CreateIndex
CREATE INDEX "recurring_visitor_passes_companyId_status_idx" ON "recurring_visitor_passes"("companyId", "status");

-- CreateIndex
CREATE INDEX "recurring_visitor_passes_companyId_visitorMobile_idx" ON "recurring_visitor_passes"("companyId", "visitorMobile");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_gate_passes_passNumber_key" ON "vehicle_gate_passes"("passNumber");

-- CreateIndex
CREATE INDEX "vehicle_gate_passes_companyId_entryTime_idx" ON "vehicle_gate_passes"("companyId", "entryTime");

-- CreateIndex
CREATE INDEX "vehicle_gate_passes_companyId_vehicleRegNumber_idx" ON "vehicle_gate_passes"("companyId", "vehicleRegNumber");

-- CreateIndex
CREATE UNIQUE INDEX "material_gate_passes_passNumber_key" ON "material_gate_passes"("passNumber");

-- CreateIndex
CREATE INDEX "material_gate_passes_companyId_type_idx" ON "material_gate_passes"("companyId", "type");

-- CreateIndex
CREATE INDEX "material_gate_passes_companyId_returnStatus_idx" ON "material_gate_passes"("companyId", "returnStatus");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_management_configs_companyId_key" ON "visitor_management_configs"("companyId");

-- CreateIndex
CREATE INDEX "denied_entries_companyId_deniedAt_idx" ON "denied_entries"("companyId", "deniedAt");

-- CreateIndex
CREATE INDEX "denied_entries_companyId_denialReason_idx" ON "denied_entries"("companyId", "denialReason");

-- AddForeignKey
ALTER TABLE "visitor_types" ADD CONSTRAINT "visitor_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_types" ADD CONSTRAINT "visitor_types_safetyInductionId_fkey" FOREIGN KEY ("safetyInductionId") REFERENCES "safety_inductions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_gates" ADD CONSTRAINT "visitor_gates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_inductions" ADD CONSTRAINT "safety_inductions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_visitorTypeId_fkey" FOREIGN KEY ("visitorTypeId") REFERENCES "visitor_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_checkInGateId_fkey" FOREIGN KEY ("checkInGateId") REFERENCES "visitor_gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_checkOutGateId_fkey" FOREIGN KEY ("checkOutGateId") REFERENCES "visitor_gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "visitor_gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_groupVisitId_fkey" FOREIGN KEY ("groupVisitId") REFERENCES "group_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_recurringPassId_fkey" FOREIGN KEY ("recurringPassId") REFERENCES "recurring_visitor_passes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_watchlists" ADD CONSTRAINT "visitor_watchlists_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_visits" ADD CONSTRAINT "group_visits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_visit_members" ADD CONSTRAINT "group_visit_members_groupVisitId_fkey" FOREIGN KEY ("groupVisitId") REFERENCES "group_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_visit_members" ADD CONSTRAINT "group_visit_members_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_visitor_passes" ADD CONSTRAINT "recurring_visitor_passes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_gate_passes" ADD CONSTRAINT "vehicle_gate_passes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_gate_passes" ADD CONSTRAINT "vehicle_gate_passes_entryGateId_fkey" FOREIGN KEY ("entryGateId") REFERENCES "visitor_gates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_gate_passes" ADD CONSTRAINT "vehicle_gate_passes_exitGateId_fkey" FOREIGN KEY ("exitGateId") REFERENCES "visitor_gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_gate_passes" ADD CONSTRAINT "material_gate_passes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_gate_passes" ADD CONSTRAINT "material_gate_passes_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "visitor_gates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_management_configs" ADD CONSTRAINT "visitor_management_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denied_entries" ADD CONSTRAINT "denied_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denied_entries" ADD CONSTRAINT "denied_entries_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denied_entries" ADD CONSTRAINT "denied_entries_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "visitor_watchlists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
