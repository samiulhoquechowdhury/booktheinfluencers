-- Confirmed bookings from before the calendar held dates: hold them now (AVL-4).
INSERT INTO "Blackout" ("id", "talentId", "date", "locked", "bookingId", "note")
SELECT 'blk_' || b."id", b."talentId", l."eventDate", true, b."id", 'Booked · ' || l."ref"
FROM "Booking" b JOIN "Lead" l ON l."id" = b."leadId"
WHERE b."confirmedAt" IS NOT NULL AND b."cancelledAt" IS NULL
ON CONFLICT DO NOTHING;
