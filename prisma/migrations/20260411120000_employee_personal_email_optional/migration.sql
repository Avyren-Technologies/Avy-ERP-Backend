-- Allow employees without personal email when login is not created at onboarding.
ALTER TABLE "employees" ALTER COLUMN "personalEmail" DROP NOT NULL;
