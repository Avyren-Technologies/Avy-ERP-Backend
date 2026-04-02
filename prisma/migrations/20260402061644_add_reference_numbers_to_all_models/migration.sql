-- AlterTable
ALTER TABLE "appraisal_cycles" ADD COLUMN     "referenceNumber" TEXT;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "assetNumber" TEXT;

-- AlterTable
ALTER TABLE "exit_requests" ADD COLUMN     "exitNumber" TEXT;

-- AlterTable
ALTER TABLE "hr_letters" ADD COLUMN     "letterNumber" TEXT;

-- AlterTable
ALTER TABLE "job_requisitions" ADD COLUMN     "requisitionNumber" TEXT;

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "ticketNumber" TEXT;

-- AlterTable
ALTER TABLE "training_catalogues" ADD COLUMN     "catalogueNumber" TEXT;
