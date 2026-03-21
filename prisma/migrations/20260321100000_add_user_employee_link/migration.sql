-- AlterTable: Add employeeId column to users table (User ↔ Employee link)
ALTER TABLE "users" ADD COLUMN "employeeId" TEXT;

-- CreateIndex: Unique constraint on users.employeeId (one-to-one mapping)
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- AddForeignKey: users.employeeId → employees.id
ALTER TABLE "users" ADD CONSTRAINT "users_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
