-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "checkInLatitude" DOUBLE PRECISION,
ADD COLUMN     "checkInLongitude" DOUBLE PRECISION,
ADD COLUMN     "checkInPhotoUrl" TEXT,
ADD COLUMN     "checkOutLatitude" DOUBLE PRECISION,
ADD COLUMN     "checkOutLongitude" DOUBLE PRECISION,
ADD COLUMN     "checkOutPhotoUrl" TEXT,
ADD COLUMN     "geoStatus" TEXT;
