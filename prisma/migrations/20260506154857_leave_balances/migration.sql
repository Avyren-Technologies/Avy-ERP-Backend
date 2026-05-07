-- CreateEnum
CREATE TYPE "LeaveTransactionType" AS ENUM ('INITIALIZED', 'ACCRUAL', 'ADJUSTMENT', 'DIRECT_EDIT', 'IMPORT', 'CARRY_FORWARD', 'ENCASHMENT', 'LEAVE_RESERVED', 'LEAVE_TAKEN', 'LEAVE_CANCELLED', 'LEAVE_PARTIAL_CANCEL', 'EXPIRED', 'AUTO_ADJUSTMENT', 'RESERVATION_RELEASED');

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "maxBackdatedDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "maxFutureDays" INTEGER NOT NULL DEFAULT 90;

-- AlterTable
ALTER TABLE "leave_balances" ADD COLUMN     "booked" DECIMAL(5,1) NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "leave_policies" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "leave_types" ADD COLUMN     "carryForwardExpiryDays" INTEGER,
ADD COLUMN     "maxEncashmentPercent" INTEGER,
ADD COLUMN     "minRetainedBalance" DECIMAL(5,1),
ADD COLUMN     "yearEndOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "leave_balance_transactions" (
    "id" TEXT NOT NULL,
    "sequenceNumber" BIGSERIAL NOT NULL,
    "leaveBalanceId" TEXT NOT NULL,
    "type" "LeaveTransactionType" NOT NULL,
    "delta" DECIMAL(5,1) NOT NULL,
    "resultingBalance" DECIMAL(5,1) NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "changedBy" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_balance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_executions" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "job_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_encashments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "days" DECIMAL(5,1) NOT NULL,
    "rateBase" TEXT NOT NULL,
    "perDayAmount" DECIMAL(10,2) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_encashments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_balance_transactions_leaveBalanceId_idx" ON "leave_balance_transactions"("leaveBalanceId");

-- CreateIndex
CREATE INDEX "leave_balance_transactions_companyId_type_idx" ON "leave_balance_transactions"("companyId", "type");

-- CreateIndex
CREATE INDEX "leave_balance_transactions_referenceId_referenceType_idx" ON "leave_balance_transactions"("referenceId", "referenceType");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balance_transactions_idempotencyKey_key" ON "leave_balance_transactions"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "job_executions_jobType_companyId_periodKey_key" ON "job_executions"("jobType", "companyId", "periodKey");

-- AddForeignKey
ALTER TABLE "leave_balance_transactions" ADD CONSTRAINT "leave_balance_transactions_leaveBalanceId_fkey" FOREIGN KEY ("leaveBalanceId") REFERENCES "leave_balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance_transactions" ADD CONSTRAINT "leave_balance_transactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_encashments" ADD CONSTRAINT "leave_encashments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_encashments" ADD CONSTRAINT "leave_encashments_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_encashments" ADD CONSTRAINT "leave_encashments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
