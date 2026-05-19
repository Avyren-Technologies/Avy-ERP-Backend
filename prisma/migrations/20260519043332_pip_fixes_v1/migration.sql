/*
  Warnings:

  - You are about to drop the column `operationNumber` on the `operations` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[companyId,code]` on the table `operations` will be added. If there are existing duplicate values, this will fail.
  - Made the column `code` on table `operations` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "operations_companyId_operationNumber_key";

-- AlterTable
ALTER TABLE "operations" DROP COLUMN "operationNumber",
ALTER COLUMN "code" SET NOT NULL;

-- AlterTable
ALTER TABLE "pip_daily_entries" ADD COLUMN     "downtimeMinutes" INTEGER,
ADD COLUMN     "downtimeReasonId" TEXT;

-- CreateTable
CREATE TABLE "downtime_reasons" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "downtime_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "downtime_reasons_companyId_name_key" ON "downtime_reasons"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "operations_companyId_code_key" ON "operations"("companyId", "code");

-- AddForeignKey
ALTER TABLE "pip_daily_entries" ADD CONSTRAINT "pip_daily_entries_downtimeReasonId_fkey" FOREIGN KEY ("downtimeReasonId") REFERENCES "downtime_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_reasons" ADD CONSTRAINT "downtime_reasons_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
