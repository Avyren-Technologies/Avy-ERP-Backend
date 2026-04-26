-- CreateEnum
CREATE TYPE "DayHalf" AS ENUM ('FIRST_HALF', 'SECOND_HALF');

-- CreateEnum
CREATE TYPE "HalfDayStatus" AS ENUM ('PRESENT', 'ABSENT', 'ON_LEAVE');

-- AlterEnum
ALTER TYPE "AttendanceSource" ADD VALUE 'HR_BOOK';

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "isOverridden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "overriddenAt" TIMESTAMP(3),
ADD COLUMN     "overriddenBy" TEXT,
ADD COLUMN     "previousSource" "AttendanceSource";

-- CreateTable
CREATE TABLE "attendance_half" (
    "id" TEXT NOT NULL,
    "attendanceRecordId" TEXT NOT NULL,
    "half" "DayHalf" NOT NULL,
    "status" "HalfDayStatus" NOT NULL,
    "leaveTypeId" TEXT,
    "leaveRequestId" TEXT,
    "overrideTime" TEXT,
    "remarks" TEXT,
    "markedBy" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_half_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_half_attendanceRecordId_idx" ON "attendance_half"("attendanceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_half_attendanceRecordId_half_key" ON "attendance_half"("attendanceRecordId", "half");

-- AddForeignKey
ALTER TABLE "attendance_half" ADD CONSTRAINT "attendance_half_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_half" ADD CONSTRAINT "attendance_half_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_half" ADD CONSTRAINT "attendance_half_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
