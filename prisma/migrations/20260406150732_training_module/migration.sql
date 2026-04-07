/*
  Warnings:

  - The values [ENROLLED] on the enum `TrainingNominationStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `ipAddress` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `newValues` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `oldValues` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `tenantId` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `userAgent` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `audit_logs` table. All the data in the column will be lost.
  - Added the required column `changedBy` to the `audit_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `audit_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `retentionDate` to the `audit_logs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "RequisitionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EvalRecommendation" AS ENUM ('STRONG_HIRE', 'HIRE', 'MAYBE', 'NO_HIRE', 'STRONG_NO_HIRE');

-- CreateEnum
CREATE TYPE "TrainingSessionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrainingAttendanceStatus" AS ENUM ('REGISTERED', 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "EvaluationType" AS ENUM ('PARTICIPANT_FEEDBACK', 'TRAINER_ASSESSMENT');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('EARNED', 'EXPIRING_SOON', 'EXPIRED', 'RENEWED');

-- CreateEnum
CREATE TYPE "ProgramEnrollmentStatus" AS ENUM ('ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ABANDONED');

-- AlterEnum
BEGIN;
CREATE TYPE "TrainingNominationStatus_new" AS ENUM ('NOMINATED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
ALTER TABLE "training_nominations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "training_nominations" ALTER COLUMN "status" TYPE "TrainingNominationStatus_new" USING ("status"::text::"TrainingNominationStatus_new");
ALTER TYPE "TrainingNominationStatus" RENAME TO "TrainingNominationStatus_old";
ALTER TYPE "TrainingNominationStatus_new" RENAME TO "TrainingNominationStatus";
DROP TYPE "TrainingNominationStatus_old";
ALTER TABLE "training_nominations" ALTER COLUMN "status" SET DEFAULT 'NOMINATED';
COMMIT;

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "ipAddress",
DROP COLUMN "newValues",
DROP COLUMN "oldValues",
DROP COLUMN "tenantId",
DROP COLUMN "timestamp",
DROP COLUMN "userAgent",
DROP COLUMN "userId",
ADD COLUMN     "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "changedBy" TEXT NOT NULL,
ADD COLUMN     "changes" JSONB,
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "retentionDate" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "employeeId" TEXT;

-- AlterTable
ALTER TABLE "job_requisitions" ADD COLUMN     "employmentType" "EmploymentType",
ADD COLUMN     "experienceMax" INTEGER,
ADD COLUMN     "experienceMin" INTEGER,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "priority" "RequisitionPriority",
ADD COLUMN     "requirements" TEXT;

-- AlterTable
ALTER TABLE "training_nominations" ADD COLUMN     "certificateExpiryDate" TIMESTAMP(3),
ADD COLUMN     "certificateIssuedAt" TIMESTAMP(3),
ADD COLUMN     "certificateNumber" TEXT,
ADD COLUMN     "certificateStatus" "CertificateStatus",
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "candidate_offers" (
    "id" TEXT NOT NULL,
    "offerNumber" TEXT,
    "candidateId" TEXT NOT NULL,
    "designationId" TEXT,
    "departmentId" TEXT,
    "offeredCtc" DECIMAL(15,2) NOT NULL,
    "ctcBreakup" JSONB,
    "joiningDate" DATE,
    "offerLetterUrl" TEXT,
    "validUntil" DATE,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_education" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "degree" TEXT,
    "institution" TEXT,
    "university" TEXT,
    "yearOfPassing" INTEGER,
    "percentage" DECIMAL(5,2),
    "certificateUrl" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_experience" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "fromDate" DATE,
    "toDate" DATE,
    "currentlyWorking" BOOLEAN NOT NULL DEFAULT false,
    "ctc" DECIMAL(15,2),
    "description" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_documents" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_evaluations" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comments" TEXT,
    "recommendation" "EvalRecommendation" NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_stage_history" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fromStage" "CandidateStage" NOT NULL,
    "toStage" "CandidateStage" NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "candidate_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "sessionNumber" TEXT,
    "trainingId" TEXT NOT NULL,
    "batchName" TEXT,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "meetingLink" TEXT,
    "maxParticipants" INTEGER,
    "trainerId" TEXT,
    "status" "TrainingSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancelledReason" TEXT,
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_attendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "nominationId" TEXT,
    "status" "TrainingAttendanceStatus" NOT NULL DEFAULT 'REGISTERED',
    "checkInTime" TIMESTAMP(3),
    "checkOutTime" TIMESTAMP(3),
    "hoursAttended" DECIMAL(4,1),
    "remarks" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_evaluations" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT,
    "nominationId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" "EvaluationType" NOT NULL,
    "contentRelevance" INTEGER,
    "trainerEffectiveness" INTEGER,
    "overallSatisfaction" INTEGER,
    "knowledgeGain" INTEGER,
    "practicalApplicability" INTEGER,
    "preAssessmentScore" DECIMAL(5,2),
    "postAssessmentScore" DECIMAL(5,2),
    "comments" TEXT,
    "improvementSuggestions" TEXT,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainers" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "externalName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "specializations" JSONB,
    "qualifications" TEXT,
    "experienceYears" INTEGER,
    "averageRating" DECIMAL(3,2),
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_programs" (
    "id" TEXT NOT NULL,
    "programNumber" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "level" TEXT,
    "totalDuration" TEXT,
    "isCompulsory" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_program_courses" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "isPrerequisite" BOOLEAN NOT NULL DEFAULT false,
    "minPassScore" DECIMAL(5,2),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_program_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_program_enrollments" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "ProgramEnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_program_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_budgets" (
    "id" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "departmentId" TEXT,
    "allocatedAmount" DECIMAL(15,2) NOT NULL,
    "usedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_materials" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "sequenceOrder" INTEGER,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "deviceName" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_offers_companyId_status_idx" ON "candidate_offers"("companyId", "status");

-- CreateIndex
CREATE INDEX "candidate_offers_candidateId_idx" ON "candidate_offers"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_education_candidateId_idx" ON "candidate_education"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_experience_candidateId_idx" ON "candidate_experience"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_documents_candidateId_idx" ON "candidate_documents"("candidateId");

-- CreateIndex
CREATE INDEX "interview_evaluations_interviewId_idx" ON "interview_evaluations"("interviewId");

-- CreateIndex
CREATE INDEX "candidate_stage_history_candidateId_idx" ON "candidate_stage_history"("candidateId");

-- CreateIndex
CREATE INDEX "training_sessions_companyId_status_idx" ON "training_sessions"("companyId", "status");

-- CreateIndex
CREATE INDEX "training_sessions_trainingId_idx" ON "training_sessions"("trainingId");

-- CreateIndex
CREATE INDEX "training_sessions_trainerId_idx" ON "training_sessions"("trainerId");

-- CreateIndex
CREATE INDEX "training_attendance_sessionId_idx" ON "training_attendance"("sessionId");

-- CreateIndex
CREATE INDEX "training_attendance_employeeId_idx" ON "training_attendance"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "training_attendance_sessionId_employeeId_key" ON "training_attendance"("sessionId", "employeeId");

-- CreateIndex
CREATE INDEX "training_evaluations_nominationId_idx" ON "training_evaluations"("nominationId");

-- CreateIndex
CREATE INDEX "training_evaluations_sessionId_idx" ON "training_evaluations"("sessionId");

-- CreateIndex
CREATE INDEX "trainers_companyId_isActive_idx" ON "trainers"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "training_programs_companyId_isActive_idx" ON "training_programs"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "training_program_courses_programId_idx" ON "training_program_courses"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "training_program_courses_programId_trainingId_key" ON "training_program_courses"("programId", "trainingId");

-- CreateIndex
CREATE INDEX "training_program_enrollments_programId_idx" ON "training_program_enrollments"("programId");

-- CreateIndex
CREATE INDEX "training_program_enrollments_employeeId_idx" ON "training_program_enrollments"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "training_program_enrollments_programId_employeeId_key" ON "training_program_enrollments"("programId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "training_budgets_fiscalYear_companyId_departmentId_key" ON "training_budgets"("fiscalYear", "companyId", "departmentId");

-- CreateIndex
CREATE INDEX "training_materials_trainingId_idx" ON "training_materials"("trainingId");

-- CreateIndex
CREATE INDEX "analytics_snapshots_companyId_snapshotType_idx" ON "analytics_snapshots"("companyId", "snapshotType");

-- CreateIndex
CREATE INDEX "analytics_snapshots_createdAt_idx" ON "analytics_snapshots"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_companyId_createdAt_idx" ON "notifications"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "user_devices_userId_idx" ON "user_devices"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_userId_fcmToken_key" ON "user_devices"("userId", "fcmToken");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_entityType_entityId_idx" ON "audit_logs"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_changedBy_idx" ON "audit_logs"("changedBy");

-- CreateIndex
CREATE INDEX "audit_logs_retentionDate_idx" ON "audit_logs"("retentionDate");

-- CreateIndex
CREATE INDEX "candidates_companyId_stage_idx" ON "candidates"("companyId", "stage");

-- CreateIndex
CREATE INDEX "candidates_requisitionId_stage_idx" ON "candidates"("requisitionId", "stage");

-- CreateIndex
CREATE INDEX "candidates_email_idx" ON "candidates"("email");

-- CreateIndex
CREATE INDEX "interviews_companyId_status_idx" ON "interviews"("companyId", "status");

-- CreateIndex
CREATE INDEX "interviews_candidateId_status_idx" ON "interviews"("candidateId", "status");

-- CreateIndex
CREATE INDEX "interviews_scheduledAt_idx" ON "interviews"("scheduledAt");

-- CreateIndex
CREATE INDEX "job_requisitions_companyId_status_idx" ON "job_requisitions"("companyId", "status");

-- CreateIndex
CREATE INDEX "training_catalogues_companyId_isActive_idx" ON "training_catalogues"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "training_nominations_companyId_status_idx" ON "training_nominations"("companyId", "status");

-- CreateIndex
CREATE INDEX "training_nominations_employeeId_status_idx" ON "training_nominations"("employeeId", "status");

-- AddForeignKey
ALTER TABLE "candidate_offers" ADD CONSTRAINT "candidate_offers_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_offers" ADD CONSTRAINT "candidate_offers_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_offers" ADD CONSTRAINT "candidate_offers_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_offers" ADD CONSTRAINT "candidate_offers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_stage_history" ADD CONSTRAINT "candidate_stage_history_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_stage_history" ADD CONSTRAINT "candidate_stage_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_nominations" ADD CONSTRAINT "training_nominations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_catalogues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "training_nominations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_evaluations" ADD CONSTRAINT "training_evaluations_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_catalogues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_evaluations" ADD CONSTRAINT "training_evaluations_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "training_nominations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_evaluations" ADD CONSTRAINT "training_evaluations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_evaluations" ADD CONSTRAINT "training_evaluations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_courses" ADD CONSTRAINT "training_program_courses_programId_fkey" FOREIGN KEY ("programId") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_courses" ADD CONSTRAINT "training_program_courses_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_catalogues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_courses" ADD CONSTRAINT "training_program_courses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_enrollments" ADD CONSTRAINT "training_program_enrollments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_enrollments" ADD CONSTRAINT "training_program_enrollments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_program_enrollments" ADD CONSTRAINT "training_program_enrollments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_budgets" ADD CONSTRAINT "training_budgets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_budgets" ADD CONSTRAINT "training_budgets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_materials" ADD CONSTRAINT "training_materials_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_catalogues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_materials" ADD CONSTRAINT "training_materials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
