-- CreateEnum
CREATE TYPE "MachinePriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('RUNNING', 'IDLE', 'MAINTENANCE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "PartType" AS ENUM ('FINISH_PART', 'RAW_MATERIAL', 'SEMI_FINISHED', 'CONSUMABLE', 'SPARE');

-- CreateEnum
CREATE TYPE "PartStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "PipSlabStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PipEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "PipReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'MERGED');

-- AlterTable
ALTER TABLE "system_controls" ADD COLUMN     "productionIncentivePlanEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "assetCode" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "machineCode" TEXT,
    "serialNumber" TEXT,
    "categoryId" TEXT,
    "typeId" TEXT,
    "zoneId" TEXT,
    "departmentId" TEXT,
    "lineWorkCenter" TEXT,
    "priority" "MachinePriority" NOT NULL DEFAULT 'MEDIUM',
    "capacity" TEXT,
    "powerRating" TEXT,
    "make" TEXT,
    "model" TEXT,
    "yearOfManufacture" INTEGER,
    "lastMaintenanceDate" TIMESTAMP(3),
    "nextMaintenanceDate" TIMESTAMP(3),
    "maintenanceFrequency" TEXT,
    "lastCalibrationDate" TIMESTAMP(3),
    "nextCalibrationDate" TIMESTAMP(3),
    "calibrationFrequency" TEXT,
    "vendorId" TEXT,
    "warrantyExpiry" TIMESTAMP(3),
    "amcStartDate" TIMESTAMP(3),
    "amcEndDate" TIMESTAMP(3),
    "amcVendorId" TEXT,
    "status" "MachineStatus" NOT NULL DEFAULT 'RUNNING',
    "idleReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_categories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_types" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_zones" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "locationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "partNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "engineeringPartNo" TEXT,
    "categoryId" TEXT,
    "productModelId" TEXT,
    "uomId" TEXT,
    "partType" "PartType" NOT NULL DEFAULT 'FINISH_PART',
    "revision" TEXT,
    "drawingReference" TEXT,
    "hsnCode" TEXT,
    "weight" DECIMAL(10,3),
    "dimensions" TEXT,
    "isBatchTracked" BOOLEAN NOT NULL DEFAULT false,
    "isSerialTracked" BOOLEAN NOT NULL DEFAULT false,
    "isBomEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isQcRequired" BOOLEAN NOT NULL DEFAULT false,
    "isInventoryItem" BOOLEAN NOT NULL DEFAULT false,
    "preferredVendorId" TEXT,
    "status" "PartStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_categories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "part_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_models" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units_of_measure" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pip_slab_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "machineId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "shiftTargetQty" INTEGER NOT NULL,
    "slabTiers" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "PipSlabStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pip_slab_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pip_daily_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "entryDate" DATE NOT NULL,
    "shiftId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "sessionRef" TEXT,
    "machineId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "slabConfigId" TEXT,
    "qtyProduced" INTEGER NOT NULL,
    "shiftTargetQty" INTEGER NOT NULL,
    "achievementPct" DECIMAL(7,2) NOT NULL,
    "ncCount" INTEGER NOT NULL DEFAULT 0,
    "ncReason" TEXT,
    "methodUsed" TEXT,
    "methodNumber" INTEGER,
    "cumulativeRatio" DECIMAL(7,4),
    "isEligible" BOOLEAN NOT NULL DEFAULT false,
    "incentiveAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalIncentive" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "calcBreakdown" JSONB,
    "status" "PipEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "payrollRunId" TEXT,
    "mergedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pip_daily_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pip_incentive_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "method1Enabled" BOOLEAN NOT NULL DEFAULT false,
    "method1Name" TEXT NOT NULL DEFAULT 'Excess Ratio Incentive',
    "method2Enabled" BOOLEAN NOT NULL DEFAULT false,
    "method2Name" TEXT NOT NULL DEFAULT 'Milestone Rounding Incentive',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pip_incentive_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pip_monthly_reports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PipReportStatus" NOT NULL DEFAULT 'DRAFT',
    "totalIncentive" DECIMAL(15,2) NOT NULL,
    "operatorCount" INTEGER NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "avgPerDay" DECIMAL(15,2) NOT NULL,
    "maxSingleDay" DECIMAL(15,2) NOT NULL,
    "maxSingleDayDate" DATE,
    "operatorSummary" JSONB,
    "partSummary" JSONB,
    "dailyTrend" JSONB,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "payrollRunId" TEXT,
    "mergedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pip_monthly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "machines_companyId_status_idx" ON "machines"("companyId", "status");

-- CreateIndex
CREATE INDEX "machines_companyId_categoryId_idx" ON "machines"("companyId", "categoryId");

-- CreateIndex
CREATE INDEX "machines_companyId_locationId_idx" ON "machines"("companyId", "locationId");

-- CreateIndex
CREATE INDEX "machines_companyId_zoneId_idx" ON "machines"("companyId", "zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "machines_companyId_assetCode_key" ON "machines"("companyId", "assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "machine_categories_companyId_name_key" ON "machine_categories"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "machine_types_companyId_name_key" ON "machine_types"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "machine_zones_companyId_name_key" ON "machine_zones"("companyId", "name");

-- CreateIndex
CREATE INDEX "parts_companyId_status_idx" ON "parts"("companyId", "status");

-- CreateIndex
CREATE INDEX "parts_companyId_categoryId_idx" ON "parts"("companyId", "categoryId");

-- CreateIndex
CREATE INDEX "parts_companyId_locationId_idx" ON "parts"("companyId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "parts_companyId_partNumber_key" ON "parts"("companyId", "partNumber");

-- CreateIndex
CREATE UNIQUE INDEX "part_categories_companyId_name_key" ON "part_categories"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_models_companyId_name_key" ON "product_models"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measure_companyId_abbreviation_key" ON "units_of_measure"("companyId", "abbreviation");

-- CreateIndex
CREATE INDEX "pip_slab_configs_companyId_locationId_idx" ON "pip_slab_configs"("companyId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "pip_slab_configs_companyId_machineId_partId_key" ON "pip_slab_configs"("companyId", "machineId", "partId");

-- CreateIndex
CREATE INDEX "pip_daily_entries_companyId_entryDate_shiftId_idx" ON "pip_daily_entries"("companyId", "entryDate", "shiftId");

-- CreateIndex
CREATE INDEX "pip_daily_entries_companyId_operatorId_entryDate_idx" ON "pip_daily_entries"("companyId", "operatorId", "entryDate");

-- CreateIndex
CREATE INDEX "pip_daily_entries_companyId_locationId_entryDate_idx" ON "pip_daily_entries"("companyId", "locationId", "entryDate");

-- CreateIndex
CREATE INDEX "pip_daily_entries_companyId_status_idx" ON "pip_daily_entries"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pip_incentive_configs_companyId_key" ON "pip_incentive_configs"("companyId");

-- CreateIndex
CREATE INDEX "pip_monthly_reports_companyId_status_idx" ON "pip_monthly_reports"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pip_monthly_reports_companyId_locationId_month_year_key" ON "pip_monthly_reports"("companyId", "locationId", "month", "year");

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "machine_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "machine_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "machine_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_categories" ADD CONSTRAINT "machine_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_types" ADD CONSTRAINT "machine_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_zones" ADD CONSTRAINT "machine_zones_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_zones" ADD CONSTRAINT "machine_zones_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "part_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "product_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "units_of_measure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_categories" ADD CONSTRAINT "part_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_slab_configs" ADD CONSTRAINT "pip_slab_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_slab_configs" ADD CONSTRAINT "pip_slab_configs_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_slab_configs" ADD CONSTRAINT "pip_slab_configs_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_slab_configs" ADD CONSTRAINT "pip_slab_configs_partId_fkey" FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_daily_entries" ADD CONSTRAINT "pip_daily_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_daily_entries" ADD CONSTRAINT "pip_daily_entries_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_daily_entries" ADD CONSTRAINT "pip_daily_entries_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_daily_entries" ADD CONSTRAINT "pip_daily_entries_slabConfigId_fkey" FOREIGN KEY ("slabConfigId") REFERENCES "pip_slab_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_incentive_configs" ADD CONSTRAINT "pip_incentive_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_monthly_reports" ADD CONSTRAINT "pip_monthly_reports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_monthly_reports" ADD CONSTRAINT "pip_monthly_reports_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
