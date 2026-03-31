/*
  Warnings:

  - You are about to drop the column `earlyExitMinutes` on the `attendance_rules` table. All the data in the column will be lost.
  - You are about to drop the column `lateArrivalsAllowed` on the `attendance_rules` table. All the data in the column will be lost.
  - You are about to drop the column `preferences` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `systemControls` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `downtimeSlots` on the `company_shifts` table. All the data in the column will be lost.
  - You are about to drop the column `fromTime` on the `company_shifts` table. All the data in the column will be lost.
  - You are about to drop the column `toTime` on the `company_shifts` table. All the data in the column will be lost.
  - You are about to drop the column `loginMethod` on the `ess_configs` table. All the data in the column will be lost.
  - You are about to drop the column `mfaRequired` on the `ess_configs` table. All the data in the column will be lost.
  - You are about to drop the column `passwordComplexity` on the `ess_configs` table. All the data in the column will be lost.
  - You are about to drop the column `passwordMinLength` on the `ess_configs` table. All the data in the column will be lost.
  - You are about to drop the column `sessionTimeoutMinutes` on the `ess_configs` table. All the data in the column will be lost.
  - You are about to drop the column `monthlyCap` on the `overtime_rules` table. All the data in the column will be lost.
  - You are about to drop the column `rateMultiplier` on the `overtime_rules` table. All the data in the column will be lost.
  - You are about to drop the column `weeklyCap` on the `overtime_rules` table. All the data in the column will be lost.
  - You are about to drop the `feature_toggles` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `dayBoundaryTime` on table `attendance_rules` required. This step will fail if there are existing NULL values in that column.
  - Made the column `halfDayThresholdHours` on table `attendance_rules` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fullDayThresholdHours` on table `attendance_rules` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gracePeriodMinutes` on table `attendance_rules` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `endTime` to the `company_shifts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `company_shifts` table without a default value. This is not possible if the table is not empty.
  - Made the column `thresholdMinutes` on table `overtime_rules` required. This step will fail if there are existing NULL values in that column.

*/
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

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttendanceStatus" ADD VALUE 'EARLY_EXIT';
ALTER TYPE "AttendanceStatus" ADD VALUE 'INCOMPLETE';
ALTER TYPE "AttendanceStatus" ADD VALUE 'REGULARIZED';

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "appliedBreakDeductionMinutes" INTEGER,
ADD COLUMN     "appliedEarlyExitDeduction" DECIMAL(10,2),
ADD COLUMN     "appliedFullDayThresholdHours" DECIMAL(4,2),
ADD COLUMN     "appliedGracePeriodMinutes" INTEGER,
ADD COLUMN     "appliedHalfDayThresholdHours" DECIMAL(4,2),
ADD COLUMN     "appliedLateDeduction" DECIMAL(10,2),
ADD COLUMN     "appliedPunchMode" "PunchMode",
ADD COLUMN     "evaluationContext" JSONB,
ADD COLUMN     "finalStatusReason" TEXT,
ADD COLUMN     "resolutionTrace" JSONB;

-- AlterTable
ALTER TABLE "attendance_rules" DROP COLUMN "earlyExitMinutes",
DROP COLUMN "lateArrivalsAllowed",
ADD COLUMN     "autoAbsentAfterDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "autoHalfDayEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoMarkAbsentIfNoPunch" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "earlyExitDeductionType" "DeductionType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "earlyExitDeductionValue" DECIMAL(5,2),
ADD COLUMN     "earlyExitToleranceMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "ignoreLateOnHoliday" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ignoreLateOnLeaveDay" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ignoreLateOnWeekOff" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lateArrivalsAllowedPerMonth" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "lateDeductionType" "DeductionType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "lateDeductionValue" DECIMAL(5,2),
ADD COLUMN     "maxLateCheckInMinutes" INTEGER NOT NULL DEFAULT 240,
ADD COLUMN     "punchMode" "PunchMode" NOT NULL DEFAULT 'FIRST_LAST',
ADD COLUMN     "punchTimeRounding" "PunchRounding" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "punchTimeRoundingDirection" "RoundingDirection" NOT NULL DEFAULT 'NEAREST',
ADD COLUMN     "regularizationWindowDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "updatedBy" TEXT,
ADD COLUMN     "workingHoursRounding" "RoundingStrategy" NOT NULL DEFAULT 'NONE',
ALTER COLUMN "dayBoundaryTime" SET NOT NULL,
ALTER COLUMN "dayBoundaryTime" SET DEFAULT '00:00',
ALTER COLUMN "halfDayThresholdHours" SET NOT NULL,
ALTER COLUMN "halfDayThresholdHours" SET DEFAULT 4,
ALTER COLUMN "fullDayThresholdHours" SET NOT NULL,
ALTER COLUMN "fullDayThresholdHours" SET DEFAULT 8,
ALTER COLUMN "gracePeriodMinutes" SET NOT NULL,
ALTER COLUMN "gracePeriodMinutes" SET DEFAULT 15;

-- AlterTable
ALTER TABLE "companies" DROP COLUMN "preferences",
DROP COLUMN "systemControls";

-- AlterTable
ALTER TABLE "company_shifts" DROP COLUMN "downtimeSlots",
DROP COLUMN "fromTime",
DROP COLUMN "toTime",
ADD COLUMN     "allowedSources" "DeviceType"[],
ADD COLUMN     "autoClockOutMinutes" INTEGER,
ADD COLUMN     "earlyExitToleranceMinutes" INTEGER,
ADD COLUMN     "endTime" TEXT NOT NULL,
ADD COLUMN     "fullDayThresholdHours" DECIMAL(4,2),
ADD COLUMN     "gracePeriodMinutes" INTEGER,
ADD COLUMN     "halfDayThresholdHours" DECIMAL(4,2),
ADD COLUMN     "isCrossDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxLateCheckInMinutes" INTEGER,
ADD COLUMN     "minWorkingHoursForOT" DECIMAL(4,2),
ADD COLUMN     "requireGPS" BOOLEAN,
ADD COLUMN     "requireSelfie" BOOLEAN,
ADD COLUMN     "shiftType" "ShiftType" NOT NULL DEFAULT 'DAY',
ADD COLUMN     "startTime" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ess_configs" DROP COLUMN "loginMethod",
DROP COLUMN "mfaRequired",
DROP COLUMN "passwordComplexity",
DROP COLUMN "passwordMinLength",
DROP COLUMN "sessionTimeoutMinutes",
ADD COLUMN     "announcementBoard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "downloadPayslips" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "leaveCancellation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mobileLocationAccuracy" "LocationAccuracy" NOT NULL DEFAULT 'HIGH',
ADD COLUMN     "mobileOfflinePunch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mobileSyncRetryMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "mssApproveAttendance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mssApproveLeave" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mssViewTeam" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mssViewTeamAttendance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shiftSwapRequest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedBy" TEXT,
ADD COLUMN     "viewOrgChart" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "viewSalaryStructure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "viewShiftSchedule" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wfhRequest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "allowedDevices" "DeviceType"[],
ADD COLUMN     "geoPolygon" JSONB,
ADD COLUMN     "requireLiveLocation" BOOLEAN,
ADD COLUMN     "requireSelfie" BOOLEAN;

-- AlterTable
ALTER TABLE "overtime_rules" DROP COLUMN "monthlyCap",
DROP COLUMN "rateMultiplier",
DROP COLUMN "weeklyCap",
ADD COLUMN     "calculationBasis" "OTCalculationBasis" NOT NULL DEFAULT 'AFTER_SHIFT',
ADD COLUMN     "compOffEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "compOffExpiryDays" INTEGER,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "dailyCapHours" DECIMAL(4,1),
ADD COLUMN     "enforceCaps" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "holidayMultiplier" DECIMAL(3,2),
ADD COLUMN     "includeBreaksInOT" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxContinuousOtHours" DECIMAL(4,1),
ADD COLUMN     "minimumOtMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "monthlyCapHours" DECIMAL(5,1),
ADD COLUMN     "nightShiftMultiplier" DECIMAL(3,2),
ADD COLUMN     "roundingStrategy" "RoundingStrategy" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "updatedBy" TEXT,
ADD COLUMN     "weekdayMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.5,
ADD COLUMN     "weekendMultiplier" DECIMAL(3,2),
ADD COLUMN     "weeklyCapHours" DECIMAL(5,1),
ALTER COLUMN "thresholdMinutes" SET NOT NULL,
ALTER COLUMN "thresholdMinutes" SET DEFAULT 30;

-- DropTable
DROP TABLE "feature_toggles";

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
    "recruitmentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trainingEnabled" BOOLEAN NOT NULL DEFAULT false,
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
    "auditLogRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_controls_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_companyId_key" ON "company_settings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "system_controls_companyId_key" ON "system_controls"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_attendanceRecordId_key" ON "overtime_requests"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "overtime_requests_companyId_status_idx" ON "overtime_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "overtime_requests_employeeId_date_idx" ON "overtime_requests"("employeeId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_companyId_date_idx" ON "attendance_records"("companyId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_companyId_status_idx" ON "attendance_records"("companyId", "status");

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_controls" ADD CONSTRAINT "system_controls_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_breaks" ADD CONSTRAINT "shift_breaks_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "company_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_overtimeRuleId_fkey" FOREIGN KEY ("overtimeRuleId") REFERENCES "overtime_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
