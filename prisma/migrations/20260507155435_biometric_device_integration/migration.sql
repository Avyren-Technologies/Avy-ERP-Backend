/*
  Warnings:

  - You are about to drop the column `brand` on the `biometric_devices` table. All the data in the column will be lost.
  - You are about to drop the column `deviceId` on the `biometric_devices` table. All the data in the column will be lost.
  - You are about to drop the column `enrolledCount` on the `biometric_devices` table. All the data in the column will be lost.
  - You are about to drop the column `ipAddress` on the `biometric_devices` table. All the data in the column will be lost.
  - You are about to drop the column `lastSyncAt` on the `biometric_devices` table. All the data in the column will be lost.
  - You are about to drop the column `lastSyncStatus` on the `biometric_devices` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `biometric_devices` table. All the data in the column will be lost.
  - You are about to drop the column `port` on the `biometric_devices` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `biometric_devices` table. All the data in the column will be lost.
  - You are about to drop the column `syncIntervalMin` on the `biometric_devices` table. All the data in the column will be lost.
  - You are about to drop the column `syncMode` on the `biometric_devices` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[serialNumber]` on the table `biometric_devices` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[claimToken]` on the table `biometric_devices` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `serialNumber` to the `biometric_devices` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "biometric_devices" DROP CONSTRAINT "biometric_devices_companyId_fkey";

-- DropIndex
DROP INDEX "biometric_devices_companyId_deviceId_key";

-- AlterTable
ALTER TABLE "biometric_devices" DROP COLUMN "brand",
DROP COLUMN "deviceId",
DROP COLUMN "enrolledCount",
DROP COLUMN "ipAddress",
DROP COLUMN "lastSyncAt",
DROP COLUMN "lastSyncStatus",
DROP COLUMN "name",
DROP COLUMN "port",
DROP COLUMN "status",
DROP COLUMN "syncIntervalMin",
DROP COLUMN "syncMode",
ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "claimStatus" TEXT NOT NULL DEFAULT 'UNCLAIMED',
ADD COLUMN     "claimToken" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedBy" TEXT,
ADD COLUMN     "deviceName" TEXT NOT NULL DEFAULT 'Unassigned Device',
ADD COLUMN     "firmwareVersion" TEXT,
ADD COLUMN     "heartbeatCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "protocol" TEXT NOT NULL DEFAULT 'ADMS',
ADD COLUMN     "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "serialNumber" TEXT NOT NULL,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
ALTER COLUMN "companyId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "employee_biometric_mappings" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceSerialNumber" TEXT NOT NULL,
    "deviceUserId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_biometric_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_punch_logs" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "companyId" TEXT,
    "serialNumber" TEXT NOT NULL,
    "deviceUserId" TEXT NOT NULL,
    "punchTime" TIMESTAMP(3) NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 0,
    "verifyType" INTEGER NOT NULL DEFAULT 0,
    "rawPayload" TEXT NOT NULL,
    "dedupeHash" TEXT NOT NULL,
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "employeeId" TEXT,
    "attendanceRecordId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_punch_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_biometric_mappings_companyId_idx" ON "employee_biometric_mappings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_biometric_mappings_deviceSerialNumber_deviceUserId_key" ON "employee_biometric_mappings"("deviceSerialNumber", "deviceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_biometric_mappings_employeeId_deviceSerialNumber_key" ON "employee_biometric_mappings"("employeeId", "deviceSerialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_punch_logs_dedupeHash_key" ON "biometric_punch_logs"("dedupeHash");

-- CreateIndex
CREATE INDEX "biometric_punch_logs_companyId_processingStatus_idx" ON "biometric_punch_logs"("companyId", "processingStatus");

-- CreateIndex
CREATE INDEX "biometric_punch_logs_deviceId_deviceUserId_idx" ON "biometric_punch_logs"("deviceId", "deviceUserId");

-- CreateIndex
CREATE INDEX "biometric_punch_logs_companyId_punchTime_idx" ON "biometric_punch_logs"("companyId", "punchTime");

-- CreateIndex
CREATE INDEX "biometric_punch_logs_employeeId_punchTime_idx" ON "biometric_punch_logs"("employeeId", "punchTime");

-- CreateIndex
CREATE INDEX "biometric_punch_logs_processingStatus_retryCount_idx" ON "biometric_punch_logs"("processingStatus", "retryCount");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_devices_serialNumber_key" ON "biometric_devices"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_devices_claimToken_key" ON "biometric_devices"("claimToken");

-- CreateIndex
CREATE INDEX "biometric_devices_companyId_idx" ON "biometric_devices"("companyId");

-- CreateIndex
CREATE INDEX "biometric_devices_claimStatus_idx" ON "biometric_devices"("claimStatus");

-- AddForeignKey
ALTER TABLE "employee_biometric_mappings" ADD CONSTRAINT "employee_biometric_mappings_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_biometric_mappings" ADD CONSTRAINT "employee_biometric_mappings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_devices" ADD CONSTRAINT "biometric_devices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_punch_logs" ADD CONSTRAINT "biometric_punch_logs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "biometric_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
