-- AlterTable
ALTER TABLE "Blackout" ADD COLUMN     "bookingId" TEXT;

-- AlterTable
ALTER TABLE "Talent" ADD COLUMN     "blackoutSelfEdit" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Blackout_bookingId_key" ON "Blackout"("bookingId");

-- AddForeignKey
ALTER TABLE "Blackout" ADD CONSTRAINT "Blackout_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
