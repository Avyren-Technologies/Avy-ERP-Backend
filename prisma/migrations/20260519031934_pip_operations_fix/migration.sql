/*
  Warnings:

  - The `processType` column on the `operations` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "operations" ADD COLUMN     "processCategoryId" TEXT,
DROP COLUMN "processType",
ADD COLUMN     "processType" TEXT;

-- CreateTable
CREATE TABLE "process_categories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "process_categories_companyId_name_key" ON "process_categories"("companyId", "name");

-- AddForeignKey
ALTER TABLE "process_categories" ADD CONSTRAINT "process_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_processCategoryId_fkey" FOREIGN KEY ("processCategoryId") REFERENCES "process_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
