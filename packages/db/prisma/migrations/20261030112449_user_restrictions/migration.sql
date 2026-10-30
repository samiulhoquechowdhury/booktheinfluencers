-- CreateEnum
CREATE TYPE "AccountRestriction" AS ENUM ('DEACTIVATED', 'BLOCKED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "disabledByName" TEXT,
ADD COLUMN     "disabledKind" "AccountRestriction",
ADD COLUMN     "disabledReason" TEXT;

-- Customers and artists had no last sign-in until now: take it from their history.
UPDATE "User" u SET "lastLoginAt" = e.latest
FROM (SELECT "userId", max("createdAt") AS latest FROM "LoginEvent" WHERE "event" = 'sign_in' AND "userId" IS NOT NULL GROUP BY "userId") e
WHERE e."userId" = u."id" AND u."lastLoginAt" IS NULL;
