-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "geofenceId" TEXT;

-- AlterTable
ALTER TABLE "system_controls" ALTER COLUMN "recruitmentEnabled" SET DEFAULT true,
ALTER COLUMN "trainingEnabled" SET DEFAULT true;

-- CreateTable
CREATE TABLE "geofences" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radius" INTEGER NOT NULL DEFAULT 100,
    "address" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "geofences_companyId_idx" ON "geofences"("companyId");

-- CreateIndex
CREATE INDEX "geofences_locationId_idx" ON "geofences"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "geofences_locationId_name_key" ON "geofences"("locationId", "name");

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "geofences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
