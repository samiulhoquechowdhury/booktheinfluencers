-- The client's main hero photo (apps/web/public/images/hero-main.jpg) goes on the main slide, unless an admin
-- already changed that slide's photo. The previous stage photo moves to the end as its own slide.
UPDATE "HeroSlide"
SET "imagePath" = '/images/hero-main.jpg',
    "imageAlt" = 'A singer silhouetted against an orange and purple stage light, pointing to a cheering crowd',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'hero_default' AND "imageId" IS NULL AND "imagePath" = '/images/hero.jpg';

INSERT INTO "HeroSlide" ("id", "position", "active", "imagePath", "imageAlt", "eyebrow", "title", "accent", "body", "ctaLabel", "ctaHref", "textPosition", "updatedAt")
SELECT 'hero_stage', COALESCE(MAX("position"), -1) + 1, true, '/images/hero.jpg',
       'Singer with a microphone on stage, flanked by three performers under warm stage lights',
       'Live acts · weddings · corporate nights', 'Singers, DJs and comedians', 'for every stage.',
       'From a sangeet to an annual day, we confirm the artist''s date with their own team and handle the quote, contract and payments.',
       'Explore talent', '#talent', 'left', CURRENT_TIMESTAMP
FROM "HeroSlide"
ON CONFLICT ("id") DO NOTHING;
