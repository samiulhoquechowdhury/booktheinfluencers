-- CreateEnum
CREATE TYPE "TalentReviewStatus" AS ENUM ('INCOMPLETE', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Talent" ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewStatus" "TalentReviewStatus",
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByName" TEXT,
ADD COLUMN     "socialLinks" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TalentDocument" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TalentDocument_talentId_idx" ON "TalentDocument"("talentId");

-- CreateIndex
CREATE INDEX "Talent_reviewStatus_submittedAt_idx" ON "Talent"("reviewStatus", "submittedAt");

-- AddForeignKey
ALTER TABLE "TalentDocument" ADD CONSTRAINT "TalentDocument_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
