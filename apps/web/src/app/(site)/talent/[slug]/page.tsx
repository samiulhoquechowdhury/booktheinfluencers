import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, BadgeCheck, CalendarCheck, Clapperboard, Languages, MapPin, Plane, ShieldCheck } from "lucide-react";
import { CATEGORIES, TALENTS } from "@repo/mock/catalogue/data";
import { similarTo, talentProfile } from "@/lib/catalogue";
import { REPRESENTATION_HELP, REPRESENTATION_LABELS, ctaLabel, enquiryHref, feeBand } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { FavouriteButton } from "@/components/talent/favourite-button";
import { CompareButton, CompareTray } from "@/components/talent/compare-button";
import { TalentCard } from "@/components/talent/talent-card";
import { Spinner } from "@/components/ui/feedback";

export function generateStaticParams() {
  return TALENTS.map((talent) => ({ slug: talent.slug }));
}

export async function generateMetadata({ params }: PageProps<"/talent/[slug]">): Promise<Metadata> {
  const talent = await talentProfile((await params).slug);
  // Runs before streaming starts, so unknown slugs get a real 404 status.
  if (!talent) notFound();
  const description = `${talent.headline} based in ${talent.baseCity}. ${talent.bio.slice(0, 120)}…`;
  return {
    title: `${talent.stageName} — ${talent.headline}`,
    description,
    alternates: { canonical: `/talent/${talent.slug}` },
    openGraph: { title: talent.stageName, description, images: [`${talent.photo}&w=1200&h=630`] },
  };
}

/** URL data is read inside Suspense so navigation shows the shell instantly. */
export default function TalentProfilePage({ params }: PageProps<"/talent/[slug]">) {
  return (
    <Suspense fallback={<Spinner label="Loading profile" />}>
      <Profile params={params} />
    </Suspense>
  );
}

async function Profile({ params }: Pick<PageProps<"/talent/[slug]">, "params">) {
  const talent = await talentProfile((await params).slug);
  if (!talent) notFound();

  const categoryNames = talent.categories.map((slug) => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug);
  const similar = await similarTo(talent);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: talent.stageName,
    jobTitle: talent.headline,
    description: talent.bio,
    image: `${talent.photo}&w=800`,
    url: `${SITE_URL}/talent/${talent.slug}`,
    homeLocation: { "@type": "Place", name: talent.baseCity },
    knowsLanguage: talent.languages,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="shell pt-8">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/talent" className="hover:text-ink">
            Talent
          </Link>
          {" / "}
          <Link href={`/categories/${talent.categories[0]}`} className="hover:text-ink">
            {categoryNames[0]}
          </Link>
          {" / "}
          <span className="text-ink">{talent.stageName}</span>
        </nav>
      </div>

      <section className="shell grid gap-10 py-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        {/* Gallery */}
        <div className="grid gap-3 sm:grid-cols-[1fr_140px] lg:grid-cols-[1fr_120px] xl:grid-cols-[1fr_150px]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-cream">
            <Image
              src={`${talent.photo}&w=900&h=1125`}
              alt={`Portrait of ${talent.stageName}`}
              fill
              priority
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover"
            />
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-1 sm:content-start">
            {talent.gallery.map((src, index) => (
              <li key={src} className="relative aspect-square overflow-hidden rounded-xl bg-cream">
                <Image src={`${src}&w=300&h=300`} alt={`${talent.stageName} — gallery photo ${index + 1}`} fill sizes="150px" className="object-cover" />
              </li>
            ))}
          </ul>
        </div>

        {/* Summary */}
        <div>
          <p className="eyebrow text-gold-deep">{categoryNames.join(" · ")}</p>
          <h1 className="mt-3 flex flex-wrap items-center gap-3 font-serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            {talent.stageName}
            {talent.verified && <BadgeCheck className="size-8 text-gold-deep" aria-label="Verified representative" />}
          </h1>
          <p className="mt-2 text-lg text-muted">{talent.headline}</p>

          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2 text-ink-soft">
              <MapPin className="size-4 text-gold-deep" aria-hidden />
              <dt className="sr-only">Based in</dt>
              <dd>Based in {talent.baseCity}</dd>
            </div>
            <div className="flex items-center gap-2 text-ink-soft">
              <Plane className="size-4 text-gold-deep" aria-hidden />
              <dt className="sr-only">Travels to</dt>
              <dd>Travels: {talent.travelsTo.join(", ")}</dd>
            </div>
            <div className="flex items-center gap-2 text-ink-soft sm:col-span-2">
              <Languages className="size-4 text-gold-deep" aria-hidden />
              <dt className="sr-only">Languages</dt>
              <dd>{talent.languages.join(", ")}</dd>
            </div>
          </dl>

          <div className="mt-8 rounded-card border border-line bg-cream-soft p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-[0.65rem] text-muted">Indicative fee range</p>
                <p className="mt-1 font-serif text-3xl font-semibold text-ink">{feeBand(talent)}</p>
              </div>
              {talent.tier === "PREMIUM" && (
                <span className="rounded-md bg-ink px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-wider text-warm">
                  Premium
                </span>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              The final price depends on your date, city, set length and travel. You'll get a written, itemised
              quote before you commit to anything.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={enquiryHref([talent.slug])} className="btn btn-gold">
                {ctaLabel(talent)}
                <ArrowRight aria-hidden />
              </Link>
              <FavouriteButton slug={talent.slug} name={talent.stageName} variant="inline" />
              <CompareButton slug={talent.slug} />
            </div>
          </div>

          <div className="mt-6 flex gap-3 rounded-card border border-line bg-white p-5">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold-deep" aria-hidden />
            <div>
              <p className="font-display text-sm font-semibold text-ink">
                {REPRESENTATION_LABELS[talent.representationType]}
                {talent.verified ? " · representative verified" : " · verification in progress"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{REPRESENTATION_HELP[talent.representationType]}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="shell grid gap-10 border-t border-line py-14 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-ink">About {talent.stageName.split(" ")[0]}</h2>
          <p className="mt-4 leading-relaxed text-ink-soft">{talent.bio}</p>

          <h3 className="mt-10 font-display text-base font-semibold text-ink">Great for</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {talent.eventTypes.map((type) => (
              <li key={type} className="flex items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 text-sm text-ink-soft">
                <CalendarCheck className="size-3.5 text-gold-deep" aria-hidden />
                {type}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex gap-3 rounded-card bg-ink p-5 text-white">
            <Clapperboard className="mt-0.5 size-5 shrink-0 text-warm" aria-hidden />
            <p className="text-sm leading-relaxed text-white/80">
              <span className="font-display font-semibold text-white">Showreel shared on request.</span> Ask for it in
              your brief and your booking manager will send recent performance videos.
            </p>
          </div>
        </div>

        <div>
          <h2 className="font-serif text-2xl font-semibold text-ink">Recent events</h2>
          <ul className="mt-4 divide-y divide-line rounded-card border border-line bg-white">
            {talent.pastEvents.map((event) => (
              <li key={`${event.title}-${event.year}`} className="flex items-center justify-between gap-4 px-5 py-4">
                <span>
                  <span className="block font-display text-sm font-semibold text-ink">{event.title}</span>
                  <span className="text-sm text-muted">{event.city}</span>
                </span>
                <span className="font-display text-sm text-muted">{event.year}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Client names are kept private.</p>
        </div>
      </section>

      {similar.length > 0 && (
        <section aria-labelledby="similar-heading" className="bg-cream-soft py-14">
          <div className="shell">
            <h2 id="similar-heading" className="font-serif text-2xl font-semibold text-ink">
              You might also like
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {similar.map((other) => (
                <TalentCard key={other.slug} talent={other} />
              ))}
            </div>
          </div>
        </section>
      )}

      <CompareTray />
    </>
  );
}
