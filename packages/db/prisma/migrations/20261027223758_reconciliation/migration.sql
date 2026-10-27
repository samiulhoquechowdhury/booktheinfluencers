-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "warnCount" INTEGER NOT NULL,
    "findings" JSONB NOT NULL,
    "totals" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationRun_ranAt_idx" ON "ReconciliationRun"("ranAt");
