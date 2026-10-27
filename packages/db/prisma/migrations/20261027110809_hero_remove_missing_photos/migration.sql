-- The client removed hero-2.jpg and hero-3.jpg from apps/web/public/images. Drop the built-in slides that used
-- them (unless an admin has since given them an uploaded photo) and close the gaps in the order.
DELETE FROM "HeroSlide"
WHERE "id" IN ('hero_creators', 'hero_stars') AND "imageId" IS NULL AND "imagePath" IN ('/images/hero-2.jpg', '/images/hero-3.jpg');

UPDATE "HeroSlide" AS s
SET "position" = ordered.rn - 1
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "position", "id") AS rn FROM "HeroSlide") AS ordered
WHERE s."id" = ordered."id";
