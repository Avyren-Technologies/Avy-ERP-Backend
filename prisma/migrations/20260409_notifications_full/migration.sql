-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DeviceTokenType" AS ENUM ('EXPO', 'FCM_WEB', 'FCM_NATIVE');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('ENQUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'FAILED', 'BOUNCED', 'SKIPPED', 'RETRYING', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "NotificationSource" AS ENUM ('SYSTEM', 'USER_ACTION', 'RETRY');

-- CreateEnum
CREATE TYPE "DeviceStrategy" AS ENUM ('ALL', 'LATEST_ONLY');

-- DropIndex
DROP INDEX "user_devices_userId_idx";

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "inAppNotifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "smsNotifications" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "notification_rules" ADD COLUMN     "category" TEXT,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "notification_templates" ADD COLUMN     "code" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "compiledBody" TEXT,
ADD COLUMN     "compiledSubject" TEXT,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "sensitiveFields" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "variables" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "whatsappTemplateName" TEXT;

-- Backfill: assign distinct code values so the unique index won't collide.
UPDATE "notification_templates" SET "code" = "id" WHERE "code" = '';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "actionUrl" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "category" TEXT,
ADD COLUMN     "dedupHash" TEXT,
ADD COLUMN     "deliveryStatus" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "ruleId" TEXT,
ADD COLUMN     "ruleVersion" INTEGER,
ADD COLUMN     "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "templateVersion" INTEGER,
ADD COLUMN     "traceId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: assign defaults for existing rows so NOT NULL can be enforced.
UPDATE "notifications" SET "dedupHash" = "id" WHERE "dedupHash" IS NULL;
UPDATE "notifications" SET "traceId" = "id" WHERE "traceId" IS NULL;

-- Now enforce NOT NULL after backfill.
ALTER TABLE "notifications" ALTER COLUMN "dedupHash" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "traceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_devices" ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "deviceModel" TEXT,
ADD COLUMN     "failureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastFailureAt" TIMESTAMP(3),
ADD COLUMN     "lastFailureCode" TEXT,
ADD COLUMN     "lastSuccessAt" TIMESTAMP(3),
ADD COLUMN     "locale" TEXT,
ADD COLUMN     "osVersion" TEXT,
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "tokenType" "DeviceTokenType" NOT NULL DEFAULT 'EXPO';

-- CreateTable
CREATE TABLE "notification_events" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "event" "NotificationEventType" NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "expoTicketId" TEXT,
    "receiptCheckedAt" TIMESTAMP(3),
    "receiptStatus" TEXT,
    "source" "NotificationSource" NOT NULL DEFAULT 'SYSTEM',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "traceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deviceStrategy" "DeviceStrategy" NOT NULL DEFAULT 'ALL',
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_category_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_category_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_event_aggregate_daily" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "event" "NotificationEventType" NOT NULL,
    "provider" TEXT,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_event_aggregate_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_events_notificationId_idx" ON "notification_events"("notificationId");

-- CreateIndex
CREATE INDEX "notification_events_traceId_idx" ON "notification_events"("traceId");

-- CreateIndex
CREATE INDEX "notification_events_event_occurredAt_idx" ON "notification_events"("event", "occurredAt");

-- CreateIndex
CREATE INDEX "notification_events_provider_expoTicketId_idx" ON "notification_events"("provider", "expoTicketId");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_preferences_userId_key" ON "user_notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_notification_category_preferences_userId_idx" ON "user_notification_category_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_category_preferences_userId_category_chan_key" ON "user_notification_category_preferences"("userId", "category", "channel");

-- CreateIndex
CREATE INDEX "notification_event_aggregate_daily_companyId_date_idx" ON "notification_event_aggregate_daily"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "notification_event_aggregate_daily_companyId_date_channel_e_key" ON "notification_event_aggregate_daily"("companyId", "date", "channel", "event", "provider");

-- CreateIndex
CREATE INDEX "notification_rules_companyId_triggerEvent_isActive_idx" ON "notification_rules"("companyId", "triggerEvent", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_companyId_code_channel_key" ON "notification_templates"("companyId", "code", "channel");

-- CreateIndex
CREATE INDEX "notifications_userId_status_idx" ON "notifications"("userId", "status");

-- CreateIndex
CREATE INDEX "notifications_traceId_idx" ON "notifications"("traceId");

-- CreateIndex
CREATE INDEX "notifications_dedupHash_idx" ON "notifications"("dedupHash");

-- CreateIndex
CREATE INDEX "user_devices_userId_isActive_idx" ON "user_devices"("userId", "isActive");

-- CreateIndex
CREATE INDEX "user_devices_tokenType_isActive_idx" ON "user_devices"("tokenType", "isActive");

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_category_preferences" ADD CONSTRAINT "user_notification_category_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_event_aggregate_daily" ADD CONSTRAINT "notification_event_aggregate_daily_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

