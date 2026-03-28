-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "isRegularized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leaveRequestId" TEXT,
ADD COLUMN     "regularizationReason" TEXT,
ADD COLUMN     "regularizedAt" TIMESTAMP(3),
ADD COLUMN     "regularizedBy" TEXT;

-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "deductions" JSONB,
ADD COLUMN     "earnings" JSONB,
ADD COLUMN     "employerContributions" JSONB,
ADD COLUMN     "esiEmployee" DECIMAL(15,2),
ADD COLUMN     "esiEmployer" DECIMAL(15,2),
ADD COLUMN     "grossEarnings" DECIMAL(15,2),
ADD COLUMN     "loanDeduction" DECIMAL(15,2),
ADD COLUMN     "lopDays" DECIMAL(5,1),
ADD COLUMN     "lwfEmployee" DECIMAL(15,2),
ADD COLUMN     "lwfEmployer" DECIMAL(15,2),
ADD COLUMN     "netPay" DECIMAL(15,2),
ADD COLUMN     "overtimeAmount" DECIMAL(15,2),
ADD COLUMN     "pfEmployee" DECIMAL(15,2),
ADD COLUMN     "pfEmployer" DECIMAL(15,2),
ADD COLUMN     "presentDays" DECIMAL(5,1),
ADD COLUMN     "ptAmount" DECIMAL(15,2),
ADD COLUMN     "tdsAmount" DECIMAL(15,2),
ADD COLUMN     "tdsProvisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totalDeductions" DECIMAL(15,2),
ADD COLUMN     "workingDays" INTEGER;
