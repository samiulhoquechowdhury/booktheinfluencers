-- AlterTable
ALTER TABLE "HeroSlide" ADD COLUMN     "textPosition" TEXT NOT NULL DEFAULT 'left';

-- The client's two hero photos (apps/web/public/images/hero-2.jpg, hero-3.jpg), after the original slide.
INSERT INTO "HeroSlide" ("id", "position", "active", "imagePath", "imageAlt", "eyebrow", "title", "accent", "body", "ctaLabel", "ctaHref", "textPosition", "updatedAt") VALUES
  ('hero_creators', 1, true, '/images/hero-2.jpg', 'A group of creators with a camera, a guitar and a microphone beside social media icons, and a woman''s profile lit in red', 'Creators & influencers', 'Creators who move', 'your audience.', 'Instagram, YouTube and short-video creators for launches, campaigns and live appearances, booked through their own managers with a written contract.', 'Browse creators', '/categories/creators', 'right', CURRENT_TIMESTAMP),
  ('hero_stars', 2, true, '/images/hero-3.jpg', 'Film and music stars on a blue-lit set beside creators filming selfies on a sunset-coloured backdrop', 'Stars & creators · one brief', 'From the big screen', 'to every feed.', 'Actors, playback singers and the creators your audience follows. One brief, one contract, one payment schedule, and we handle every detail until the day.', 'Plan your event', '/enquiry', 'left', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
