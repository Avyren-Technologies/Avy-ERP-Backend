/*
  Warnings:

  - A unique constraint covering the columns `[employeeId,date,shiftSequence]` on the table `attendance_records` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "OvertimeRequestSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "GeofenceEnforcementMode" AS ENUM ('OFF', 'WARN', 'STRICT');

-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('SHIFT_STRICT', 'SHIFT_RELAXED', 'FULLY_FLEXIBLE');

-- CreateEnum
CREATE TYPE "LeaveCheckInMode" AS ENUM ('STRICT', 'ALLOW_WITHIN_WINDOW', 'ALLOW_TILL_SHIFT_END', 'FULLY_FLEXIBLE');

-- CreateEnum
CREATE TYPE "ShiftMappingStrategy" AS ENUM ('BEST_FIT_HOURS');

-- DropIndex
DROP INDEX "attendance_records_employeeId_date_key";

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "isAutoMapped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isReviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "shiftSequence" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "attendance_rules" ADD COLUMN     "attendanceMode" "AttendanceMode" NOT NULL DEFAULT 'SHIFT_STRICT',
ADD COLUMN     "autoShiftMappingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "geofenceEnforcementMode" "GeofenceEnforcementMode" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "leaveAutoAdjustmentEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "leaveCheckInMode" "LeaveCheckInMode" NOT NULL DEFAULT 'STRICT',
ADD COLUMN     "maxShiftsPerDay" INTEGER,
ADD COLUMN     "minGapBetweenShiftsMinutes" INTEGER,
ADD COLUMN     "minShiftMatchPercentage" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN     "multipleShiftsPerDayEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shiftMappingStrategy" "ShiftMappingStrategy" NOT NULL DEFAULT 'BEST_FIT_HOURS',
ADD COLUMN     "weeklyReviewEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklyReviewRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ess_configs" ADD COLUMN     "overtimeView" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "overtime_requests" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "source" "OvertimeRequestSource" NOT NULL DEFAULT 'AUTO',
ALTER COLUMN "attendanceRecordId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payroll_entries" ADD COLUMN     "arrearsAmount" DECIMAL(15,2);

-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "arrearsAmount" DECIMAL(15,2);

-- AlterTable
ALTER TABLE "pf_configs" ADD COLUMN     "vpfMaxRate" DECIMAL(5,2);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employeeId_date_shiftSequence_key" ON "attendance_records"("employeeId", "date", "shiftSequence");
