-- AlterTable
ALTER TABLE "parts" ADD COLUMN     "componentTypeId" TEXT;

-- CreateTable
CREATE TABLE "component_types" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "component_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "component_types_companyId_name_key" ON "component_types"("companyId", "name");

-- CreateIndex
CREATE INDEX "parts_companyId_componentTypeId_idx" ON "parts"("companyId", "componentTypeId");

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_componentTypeId_fkey" FOREIGN KEY ("componentTypeId") REFERENCES "component_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_types" ADD CONSTRAINT "component_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
