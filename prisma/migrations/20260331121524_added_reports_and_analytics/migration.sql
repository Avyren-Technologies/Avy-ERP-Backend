-- CreateTable
CREATE TABLE "employee_analytics_daily" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalHeadcount" INTEGER NOT NULL,
    "activeCount" INTEGER NOT NULL,
    "probationCount" INTEGER NOT NULL,
    "noticeCount" INTEGER NOT NULL,
    "separatedCount" INTEGER NOT NULL,
    "joinersCount" INTEGER NOT NULL,
    "leaversCount" INTEGER NOT NULL,
    "transfersCount" INTEGER NOT NULL,
    "promotionsCount" INTEGER NOT NULL,
    "byDepartment" JSONB NOT NULL,
    "byLocation" JSONB NOT NULL,
    "byGrade" JSONB NOT NULL,
    "byEmployeeType" JSONB NOT NULL,
    "byGender" JSONB NOT NULL,
    "byAgeBand" JSONB NOT NULL,
    "byTenureBand" JSONB NOT NULL,
    "avgSpanOfControl" DOUBLE PRECISION,
    "vacancyRate" DOUBLE PRECISION,

    CONSTRAINT "employee_analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_analytics_daily" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalEmployees" INTEGER NOT NULL,
    "presentCount" INTEGER NOT NULL,
    "absentCount" INTEGER NOT NULL,
    "lateCount" INTEGER NOT NULL,
    "halfDayCount" INTEGER NOT NULL,
    "onLeaveCount" INTEGER NOT NULL,
    "weekOffCount" INTEGER NOT NULL,
    "holidayCount" INTEGER NOT NULL,
    "avgWorkedHours" DOUBLE PRECISION NOT NULL,
    "totalOvertimeHours" DOUBLE PRECISION NOT NULL,
    "totalOvertimeCost" DOUBLE PRECISION,
    "productivityIndex" DOUBLE PRECISION NOT NULL,
    "avgLateMinutes" DOUBLE PRECISION NOT NULL,
    "lateThresholdBreaches" INTEGER NOT NULL,
    "regularizationCount" INTEGER NOT NULL,
    "missedPunchCount" INTEGER NOT NULL,
    "byDepartment" JSONB NOT NULL,
    "byLocation" JSONB NOT NULL,
    "byShift" JSONB NOT NULL,
    "bySource" JSONB NOT NULL,

    CONSTRAINT "attendance_analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_analytics_monthly" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeCount" INTEGER NOT NULL,
    "totalGrossEarnings" DOUBLE PRECISION NOT NULL,
    "totalDeductions" DOUBLE PRECISION NOT NULL,
    "totalNetPay" DOUBLE PRECISION NOT NULL,
    "totalEmployerCost" DOUBLE PRECISION NOT NULL,
    "totalPFEmployee" DOUBLE PRECISION NOT NULL,
    "totalPFEmployer" DOUBLE PRECISION NOT NULL,
    "totalESIEmployee" DOUBLE PRECISION NOT NULL,
    "totalESIEmployer" DOUBLE PRECISION NOT NULL,
    "totalPT" DOUBLE PRECISION NOT NULL,
    "totalTDS" DOUBLE PRECISION NOT NULL,
    "totalLWFEmployee" DOUBLE PRECISION NOT NULL,
    "totalLWFEmployer" DOUBLE PRECISION NOT NULL,
    "totalGratuityProvision" DOUBLE PRECISION NOT NULL,
    "avgCTC" DOUBLE PRECISION NOT NULL,
    "medianCTC" DOUBLE PRECISION NOT NULL,
    "exceptionCount" INTEGER NOT NULL,
    "varianceFromLastMonth" DOUBLE PRECISION,
    "totalLoanOutstanding" DOUBLE PRECISION NOT NULL,
    "activeLoanCount" INTEGER NOT NULL,
    "totalSalaryHolds" INTEGER NOT NULL,
    "totalBonusDisbursed" DOUBLE PRECISION NOT NULL,
    "totalIncentivesPaid" DOUBLE PRECISION NOT NULL,
    "byDepartment" JSONB NOT NULL,
    "byLocation" JSONB NOT NULL,
    "byGrade" JSONB NOT NULL,
    "byCTCBand" JSONB NOT NULL,
    "byComponent" JSONB NOT NULL,

    CONSTRAINT "payroll_analytics_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attrition_metrics_monthly" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attritionRate" DOUBLE PRECISION NOT NULL,
    "voluntaryRate" DOUBLE PRECISION NOT NULL,
    "involuntaryRate" DOUBLE PRECISION NOT NULL,
    "earlyAttritionRate" DOUBLE PRECISION NOT NULL,
    "totalExits" INTEGER NOT NULL,
    "voluntaryExits" INTEGER NOT NULL,
    "involuntaryExits" INTEGER NOT NULL,
    "retirements" INTEGER NOT NULL,
    "earlyExits" INTEGER NOT NULL,
    "avgTenureAtExit" DOUBLE PRECISION NOT NULL,
    "exitReasonBreakdown" JSONB NOT NULL,
    "wouldRecommendAvg" DOUBLE PRECISION,
    "flightRiskEmployees" JSONB NOT NULL,
    "pendingFnFCount" INTEGER NOT NULL,
    "totalFnFAmount" DOUBLE PRECISION NOT NULL,
    "avgFnFProcessingDays" DOUBLE PRECISION NOT NULL,
    "byDepartment" JSONB NOT NULL,
    "byGrade" JSONB NOT NULL,
    "byTenureBand" JSONB NOT NULL,
    "bySeparationType" JSONB NOT NULL,

    CONSTRAINT "attrition_metrics_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_alerts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dashboard" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "analytics_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "dashboard" TEXT,
    "reportType" TEXT,
    "filters" JSONB,
    "exportFormat" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_analytics_daily_companyId_date_idx" ON "employee_analytics_daily"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_analytics_daily_companyId_date_version_key" ON "employee_analytics_daily"("companyId", "date", "version");

-- CreateIndex
CREATE INDEX "attendance_analytics_daily_companyId_date_idx" ON "attendance_analytics_daily"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_analytics_daily_companyId_date_version_key" ON "attendance_analytics_daily"("companyId", "date", "version");

-- CreateIndex
CREATE INDEX "payroll_analytics_monthly_companyId_year_month_idx" ON "payroll_analytics_monthly"("companyId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_analytics_monthly_companyId_month_year_version_key" ON "payroll_analytics_monthly"("companyId", "month", "year", "version");

-- CreateIndex
CREATE INDEX "attrition_metrics_monthly_companyId_year_month_idx" ON "attrition_metrics_monthly"("companyId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "attrition_metrics_monthly_companyId_month_year_version_key" ON "attrition_metrics_monthly"("companyId", "month", "year", "version");

-- CreateIndex
CREATE INDEX "analytics_alerts_companyId_status_severity_idx" ON "analytics_alerts"("companyId", "status", "severity");

-- CreateIndex
CREATE INDEX "analytics_alerts_companyId_dashboard_idx" ON "analytics_alerts"("companyId", "dashboard");

-- CreateIndex
CREATE INDEX "analytics_audit_logs_companyId_userId_createdAt_idx" ON "analytics_audit_logs"("companyId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_audit_logs_companyId_action_createdAt_idx" ON "analytics_audit_logs"("companyId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "appraisal_entries_cycleId_status_idx" ON "appraisal_entries"("cycleId", "status");

-- CreateIndex
CREATE INDEX "appraisal_entries_companyId_cycleId_idx" ON "appraisal_entries"("companyId", "cycleId");

-- CreateIndex
CREATE INDEX "approval_requests_companyId_status_idx" ON "approval_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "approval_requests_companyId_status_entityType_idx" ON "approval_requests"("companyId", "status", "entityType");

-- CreateIndex
CREATE INDEX "feedback_360_cycleId_employeeId_idx" ON "feedback_360"("cycleId", "employeeId");

-- CreateIndex
CREATE INDEX "goals_cycleId_employeeId_idx" ON "goals"("cycleId", "employeeId");

-- CreateIndex
CREATE INDEX "goals_companyId_level_idx" ON "goals"("companyId", "level");

-- AddForeignKey
ALTER TABLE "employee_analytics_daily" ADD CONSTRAINT "employee_analytics_daily_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_analytics_daily" ADD CONSTRAINT "attendance_analytics_daily_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_analytics_monthly" ADD CONSTRAINT "payroll_analytics_monthly_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attrition_metrics_monthly" ADD CONSTRAINT "attrition_metrics_monthly_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_alerts" ADD CONSTRAINT "analytics_alerts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
