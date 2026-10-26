import "dotenv/config";
import { CATEGORIES, TALENTS } from "@repo/mock/catalogue/data";
import { BLACKOUT_SEED } from "@repo/mock/catalogue/blackouts";
import { STAFF_DEMO_PASSWORD, STAFF_USERS, internalFor, minimumRateFor } from "@repo/mock/internal";
import { buildSeed } from "@repo/mock/seed";
import { createPrismaClient, type Role } from "../src/index";
import { hashPassword } from "../src/password";

// Dev/staging seed: the same demo data the frontend mock starts with, so screens look identical
// once they switch to the API. Built by running the real mock flows (buildSeed), then copied over.

const prisma = createPrismaClient();
const big = (value: string | null) => (value === null ? null : BigInt(value));
const date = (value: string | null) => (value === null ? null : new Date(value));

async function main() {
  const demo = buildSeed();

  // Start clean — order respects foreign keys.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.paymentMilestone.deleteMany(),
    prisma.payout.deleteMany(),
    prisma.contract.deleteMany(),
    prisma.quoteLineItem.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.message.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.favourite.deleteMany(),
    prisma.blackout.deleteMany(),
    prisma.rateCard.deleteMany(),
    prisma.talentCategory.deleteMany(),
    prisma.talent.deleteMany(),
    prisma.category.deleteMany(),
    prisma.session.deleteMany(),
    prisma.notificationSeen.deleteMany(),
    prisma.user.deleteMany(),
    prisma.contactRequest.deleteMany(),
    prisma.talentApplication.deleteMany(),
    prisma.newsletterSubscriber.deleteMany(),
    prisma.counter.deleteMany(),
  ]);

  // People: staff (password + MFA), customers and talent logins.
  const passwordHash = await hashPassword(STAFF_DEMO_PASSWORD);
  await prisma.user.createMany({
    data: [
      ...STAFF_USERS.map((s) => ({ id: s.id, name: s.name, email: s.email, roles: s.roles as Role[], passwordHash })),
      ...demo.users.map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, roles: u.roles as Role[], createdAt: new Date(u.createdAt) })),
    ],
  });

  // Catalogue.
  await prisma.category.createMany({
    data: CATEGORIES.map((c, index) => ({ slug: c.slug, name: c.name, blurb: c.blurb, icon: c.icon, sortOrder: index })),
  });
  const categories = await prisma.category.findMany();
  const categoryId = (slug: string) => categories.find((c) => c.slug === slug)!.id;
  const talentUserId = (slug: string) => demo.users.find((u) => u.talentSlug === slug)?.id ?? null;

  for (const t of TALENTS) {
    const internal = internalFor(t.slug);
    await prisma.talent.create({
      data: {
        id: `tal_${t.slug}`,
        slug: t.slug,
        stageName: t.stageName,
        headline: t.headline,
        bio: t.bio,
        baseCity: t.baseCity,
        travelsTo: t.travelsTo,
        languages: t.languages,
        eventTypes: t.eventTypes,
        tags: t.tags,
        tier: t.tier,
        status: "PUBLISHED",
        featured: t.featured,
        representationType: t.representationType,
        feeBandMinPaise: big(t.feeBandMinPaise),
        feeBandMaxPaise: big(t.feeBandMaxPaise),
        photoUrl: t.photo,
        galleryUrls: t.gallery,
        pastEvents: t.pastEvents,
        userId: talentUserId(t.slug),
        categories: { create: t.categories.map((slug) => ({ categoryId: categoryId(slug) })) },
        rateCards: {
          create: { sellingRatePaise: internal.sellingRatePaise, minimumRatePaise: minimumRateFor(t.slug), payoutBps: internal.payoutBps },
        },
        reps: {
          create: {
            rep: {
              create: {
                name: internal.repName,
                phone: "0000000000",
                verification: t.verified ? "VERIFIED" : "PENDING",
              },
            },
          },
        },
        blackouts: { create: (BLACKOUT_SEED[t.slug] ?? []).map((d) => ({ date: d, locked: true, note: "Set at onboarding" })) },
      },
    });
  }

  // Pipeline, copied record for record from the mock seed.
  const ownerId = (name: string | null) => (name ? (STAFF_USERS.find((s) => s.name === name)?.id ?? null) : null);
  for (const lead of demo.leads) {
    await prisma.lead.create({
      data: {
        id: lead.id,
        ref: lead.ref,
        stage: lead.stage,
        ownerId: ownerId(lead.ownerName),
        customerId: lead.customerId,
        eventType: lead.eventType,
        eventDate: lead.eventDate,
        altDate: lead.altDate,
        city: lead.city,
        venue: lead.venue,
        audienceSize: lead.audienceSize,
        durationMins: lead.durationMins,
        budgetMinPaise: big(lead.budgetMinPaise),
        budgetMaxPaise: big(lead.budgetMaxPaise),
        language: lead.language,
        notes: lead.notes,
        contactName: lead.contactName,
        contactEmail: lead.contactEmail,
        companyName: lead.companyName,
        gstin: lead.gstin,
        lostReason: lead.lostReason,
        createdAt: new Date(lead.createdAt),
      },
    });
  }

  for (const b of demo.bookings) {
    await prisma.booking.create({
      data: {
        id: b.id,
        leadId: b.leadId,
        talentId: `tal_${b.talentSlug}`,
        availability: b.availability,
        repAcceptedAt: date(b.repAcceptedAt),
        confirmedAt: date(b.confirmedAt),
        completedAt: date(b.completedAt),
        completionNote: b.completionNote,
        cancelledAt: date(b.cancelledAt),
        cancelReason: b.cancelReason,
        sellingTotalPaise: big(b.sellingTotalPaise),
        payoutTotalPaise: big(b.payoutTotalPaise),
        marginPaise: big(b.marginPaise),
      },
    });
  }

  for (const q of demo.quotes) {
    await prisma.quote.create({
      data: {
        id: q.id,
        bookingId: q.bookingId,
        version: q.version,
        status: q.status,
        validUntil: new Date(q.validUntil),
        subtotalPaise: BigInt(q.subtotalPaise),
        taxPaise: BigInt(q.taxPaise),
        totalPaise: BigInt(q.totalPaise),
        internalCostPaise: BigInt(q.internalCostPaise),
        milestonePlan: q.milestonePlan,
        changeRequest: q.changeRequest,
        acceptedAt: date(q.acceptedAt),
        acceptedByUserId: q.acceptedByUserId,
        acceptedIp: q.acceptedIp,
        createdAt: new Date(q.createdAt),
        lineItems: {
          create: q.lineItems.map((line, position) => ({
            position,
            type: line.type,
            description: line.description,
            customerAmountPaise: BigInt(line.customerAmountPaise),
            internalCostPaise: BigInt(line.internalCostPaise),
            taxRateBps: line.taxRateBps,
          })),
        },
      },
    });
  }

  await prisma.contract.createMany({
    data: demo.contracts.map((c) => ({
      id: c.id,
      bookingId: c.bookingId,
      status: c.status,
      providerRef: c.providerRef,
      sentAt: new Date(c.sentAt),
      signedAt: date(c.signedAt),
      signedName: c.signedName,
    })),
  });

  await prisma.paymentMilestone.createMany({
    data: demo.milestones.map((m) => ({
      id: m.id,
      bookingId: m.bookingId,
      label: m.label,
      amountPaise: BigInt(m.amountPaise),
      dueDate: new Date(m.dueDate),
      status: m.status,
      isAdvance: m.isAdvance,
      paidAt: date(m.paidAt),
    })),
  });

  await prisma.payment.createMany({
    data: demo.payments.map((p) => ({
      id: p.id,
      milestoneId: p.milestoneId,
      method: p.method,
      gatewayPaymentId: p.gatewayPaymentId,
      amountPaise: BigInt(p.amountPaise),
      status: p.status,
      receivedAt: new Date(p.receivedAt),
    })),
  });

  await prisma.payout.createMany({
    data: demo.payouts.map((p) => ({ id: p.id, bookingId: p.bookingId, amountPaise: BigInt(p.amountPaise), status: p.status, paidAt: date(p.paidAt) })),
  });

  await prisma.activity.createMany({
    data: demo.activities.map((a) => ({ id: a.id, leadId: a.leadId, title: a.title, body: a.body, internal: a.internal, createdAt: new Date(a.at) })),
  });

  await prisma.message.createMany({
    data: demo.messages.map((m) => ({
      id: m.id,
      leadId: m.thread.kind === "lead" ? m.thread.leadId : null,
      bookingId: m.thread.kind === "talent" ? m.thread.bookingId : null,
      author: m.author === "customer" ? "CUSTOMER" : m.author === "talent" ? "TALENT" : "STAFF",
      authorName: m.authorName,
      body: m.body,
      createdAt: new Date(m.at),
    })),
  });

  await prisma.favourite.createMany({
    data: Object.entries(demo.favourites).flatMap(([userId, slugs]) => slugs.map((slug) => ({ userId, talentId: `tal_${slug}` }))),
  });

  await prisma.counter.create({ data: { name: "lead", value: demo.seq } });

  // AVL-4: confirmed bookings hold the artist's date (same rule as bookings/domain.ts holdDate).
  await prisma.$executeRaw`
    INSERT INTO "Blackout" ("id", "talentId", "date", "locked", "bookingId", "note")
    SELECT 'blk_' || b."id", b."talentId", l."eventDate", true, b."id", 'Booked · ' || l."ref"
    FROM "Booking" b JOIN "Lead" l ON l."id" = b."leadId"
    WHERE b."confirmedAt" IS NOT NULL AND b."cancelledAt" IS NULL
    ON CONFLICT DO NOTHING`;

  const counts = await Promise.all([prisma.user.count(), prisma.talent.count(), prisma.lead.count(), prisma.booking.count(), prisma.quote.count()]);
  console.log(`Seeded ${counts[0]} users, ${counts[1]} talents, ${counts[2]} leads, ${counts[3]} bookings, ${counts[4]} quotes.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
