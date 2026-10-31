-- CreateTable
CREATE TABLE "AssistantConfig" (
    "id" TEXT NOT NULL DEFAULT 'grok',
    "sealedKey" BYTEA NOT NULL,
    "keyHint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantConfig_pkey" PRIMARY KEY ("id")
);
