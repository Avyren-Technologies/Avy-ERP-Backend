/*
  Warnings:

  - A unique constraint covering the columns `[companyId,machineId,operationId,partId]` on the table `pip_slab_configs` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `operationId` to the `pip_slab_configs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProcessType" AS ENUM ('MACHINING', 'MOULDING', 'ASSEMBLY', 'INSPECTION', 'FINISHING', 'PACKAGING');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- DropIndex
DROP INDEX "pip_slab_configs_companyId_machineId_partId_key";

-- AlterTable
ALTER TABLE "pip_daily_entries" ADD COLUMN     "operationId" TEXT;

-- AlterTable
ALTER TABLE "pip_slab_configs" ADD COLUMN     "operationId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "operations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "operationNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "processType" "ProcessType" NOT NULL DEFAULT 'MACHINING',
    "status" "OperationStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operations_companyId_status_idx" ON "operations"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "operations_companyId_name_key" ON "operations"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "operations_companyId_operationNumber_key" ON "operations"("companyId", "operationNumber");

-- CreateIndex
CREATE INDEX "pip_daily_entries_companyId_operationId_idx" ON "pip_daily_entries"("companyId", "operationId");

-- CreateIndex
CREATE INDEX "pip_slab_configs_companyId_operationId_idx" ON "pip_slab_configs"("companyId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "pip_slab_configs_companyId_machineId_operationId_partId_key" ON "pip_slab_configs"("companyId", "machineId", "operationId", "partId");

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_slab_configs" ADD CONSTRAINT "pip_slab_configs_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_daily_entries" ADD CONSTRAINT "pip_daily_entries_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
