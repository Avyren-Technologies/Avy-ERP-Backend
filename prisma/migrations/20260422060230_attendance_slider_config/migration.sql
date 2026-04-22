-- CreateEnum
CREATE TYPE "CheckInUIMode" AS ENUM ('SLIDE', 'BUTTON');

-- AlterTable
ALTER TABLE "attendance_rules" ADD COLUMN     "checkInUIMode" "CheckInUIMode" NOT NULL DEFAULT 'SLIDE';
