-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "vpfPercentage" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "payroll_entries" ADD COLUMN     "vpfAmount" DECIMAL(15,2);

-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "vpfAmount" DECIMAL(15,2);

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

-- CreateIndex
CREATE INDEX "report_history_companyId_generatedAt_idx" ON "report_history"("companyId", "generatedAt");

-- CreateIndex
CREATE INDEX "report_history_companyId_reportType_idx" ON "report_history"("companyId", "reportType");

-- CreateIndex
CREATE INDEX "report_history_companyId_userId_idx" ON "report_history"("companyId", "userId");

-- CreateIndex
CREATE INDEX "policy_documents_companyId_isActive_idx" ON "policy_documents"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "shift_swap_requests_companyId_employeeId_idx" ON "shift_swap_requests"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "shift_swap_requests_companyId_status_idx" ON "shift_swap_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "wfh_requests_companyId_employeeId_idx" ON "wfh_requests"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "wfh_requests_companyId_status_idx" ON "wfh_requests"("companyId", "status");

-- AddForeignKey
ALTER TABLE "report_history" ADD CONSTRAINT "report_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wfh_requests" ADD CONSTRAINT "wfh_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wfh_requests" ADD CONSTRAINT "wfh_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
