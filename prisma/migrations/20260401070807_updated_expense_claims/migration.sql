-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH', 'PERSONAL_CARD', 'COMPANY_CARD', 'BANK_TRANSFER', 'UPI', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ClaimStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "ClaimStatus" ADD VALUE 'PARTIALLY_APPROVED';
ALTER TYPE "ClaimStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "expense_claims" ADD COLUMN     "approvedAmount" DECIMAL(15,2),
ADD COLUMN     "claimNumber" TEXT,
ADD COLUMN     "costCentreId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "fromDate" DATE,
ADD COLUMN     "merchantName" TEXT,
ADD COLUMN     "paidInPayrollId" TEXT,
ADD COLUMN     "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "projectCode" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "toDate" DATE;

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "referenceNumber" TEXT;

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "referenceNumber" TEXT;

-- AlterTable
ALTER TABLE "pt_configs" ADD COLUMN     "financialYear" TEXT,
ADD COLUMN     "monthlyOverrides" JSONB;

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
ALTER TABLE "expense_claim_items" ADD CONSTRAINT "expense_claim_items_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "expense_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claim_items" ADD CONSTRAINT "expense_claim_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
