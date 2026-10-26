-- AlterTable
ALTER TABLE "User" ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeroSlide" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imagePath" TEXT,
    "imageId" TEXT,
    "imageAlt" TEXT NOT NULL,
    "eyebrow" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ctaLabel" TEXT NOT NULL,
    "ctaHref" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroSlide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HeroSlide_active_position_idx" ON "HeroSlide"("active", "position");

-- AddForeignKey
ALTER TABLE "HeroSlide" ADD CONSTRAINT "HeroSlide_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The hero shown before it was editable (apps/web/src/components/home/hero.tsx).
INSERT INTO "HeroSlide" ("id", "position", "active", "imagePath", "imageAlt", "eyebrow", "title", "accent", "body", "ctaLabel", "ctaHref", "updatedAt") VALUES
  ('hero_default', 0, true, '/images/hero.jpg', 'Singer with a microphone on stage, flanked by three performers under warm stage lights', 'Managed talent booking · India', 'Book the talent.', 'We handle the rest.', 'Singers, DJs, comedians, anchors and creators for weddings, corporate nights and campus fests. We confirm availability with their representatives, then take care of the quote, contract and payments.', 'Explore talent', '#talent', CURRENT_TIMESTAMP);
