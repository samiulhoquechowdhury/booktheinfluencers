import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@repo/db";
import { signInStaff, startApp } from "./helpers";

let app: INestApplication;
let db: PrismaClient;
let http: Awaited<ReturnType<typeof startApp>>["http"];
const tokens: Record<string, string> = {};
const as = (role: string) => ({ authorization: `Bearer ${tokens[role]}` });

beforeAll(async () => {
  ({ app, db, http } = await startApp());
  for (const role of ["admin", "sales", "talent", "accounts"]) tokens[role] = await signInStaff(app, `${role}@demo.in`);
});
afterAll(async () => {
  await app?.close();
});

const profile = (stageName: string) => ({
  stageName,
  headline: "Bollywood covers and sufi sets",
  bio: "A versatile live act playing weddings and corporate nights across India.",
  baseCity: "Pune",
  travelsTo: ["Mumbai"],
  languages: ["Hindi", "English"],
  eventTypes: ["Wedding"],
  tags: ["Live Band"],
  categories: ["singers"],
  tier: "STANDARD",
  representationType: "AGENCY_MANAGED",
  featured: false,
  feeBandMinPaise: "15000000",
  feeBandMaxPaise: "30000000",
  photoUrl: "https://images.example.com/act.jpg",
  galleryUrls: [],
});

describe("talent management (ADM-1…5)", () => {
  it("creates a draft that stays off the public site until a verified rep lets it publish", async () => {
    const name = `Test Act ${Date.now()}`;
    const { body } = await http().post("/v1/admin/talents").set(as("talent")).send(profile(name)).expect(201);
    const slug = body.slug as string;
    expect(slug).toMatch(/^test-act-\d+$/);

    await http().get(`/v1/talents/${slug}`).expect(404);
    const list = await http().get("/v1/talents").query({ q: name });
    expect(JSON.stringify(list.body)).not.toContain(slug);

    const blocked = await http().post(`/v1/admin/talents/${slug}/status`).set(as("talent")).send({ status: "PUBLISHED" }).expect(409);
    expect(blocked.body.error.message).toMatch(/representative/i);

    await http().post(`/v1/admin/talents/${slug}/reps`).set(as("talent")).send({ name: "Neha Agency", agencyName: "Spotlight", phone: "9876500001", email: "" }).expect(204);
    const detail = await http().get(`/v1/admin/talents/${slug}`).set(as("talent")).expect(200);
    expect(detail.body.status).toBe("DRAFT");
    expect(detail.body.tags).toEqual(["live band"]);
    const repId = detail.body.reps[0].id as string;

    await http().post(`/v1/admin/reps/${repId}/verification`).set(as("talent")).send({ verification: "VERIFIED" }).expect(204);
    await http().post(`/v1/admin/talents/${slug}/status`).set(as("talent")).send({ status: "PUBLISHED" }).expect(204);
    await http().get(`/v1/talents/${slug}`).expect(200);

    // Revoking the only verified rep takes the profile down again (CAT-11).
    await http().post(`/v1/admin/reps/${repId}/verification`).set(as("talent")).send({ verification: "REJECTED" }).expect(204);
    await http().get(`/v1/talents/${slug}`).expect(404);
    expect((await db.talent.findUniqueOrThrow({ where: { slug } })).status).toBe("HIDDEN");

    const audit = await db.auditLog.findMany({ where: { entity: "Talent", entityId: slug }, orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => a.action)).toEqual([
      "talent.create",
      "talent.addRep",
      "talent.repVerification",
      "talent.status",
      "talent.status",
      "talent.repVerification",
    ]);
  });

  it("edits the profile and keeps slugs unique", async () => {
    const name = `Twin Act ${Date.now()}`;
    const first = await http().post("/v1/admin/talents").set(as("talent")).send(profile(name)).expect(201);
    const second = await http().post("/v1/admin/talents").set(as("talent")).send(profile(name)).expect(201);
    expect(second.body.slug).toBe(`${first.body.slug}-2`);
    await http().post("/v1/admin/talents").set(as("talent")).send({ ...profile(name), slug: first.body.slug }).expect(409);

    await http().put(`/v1/admin/talents/${first.body.slug}`).set(as("talent")).send({ ...profile(name), baseCity: "Goa", categories: ["djs", "singers"] }).expect(204);
    const detail = await http().get(`/v1/admin/talents/${first.body.slug}`).set(as("talent")).expect(200);
    expect(detail.body.baseCity).toBe("Goa");
    expect(detail.body.categories.sort()).toEqual(["djs", "singers"]);
  });

  it("validates input and enforces roles", async () => {
    const bad = await http().post("/v1/admin/talents").set(as("talent")).send({ ...profile("Bad Band"), feeBandMaxPaise: "100" }).expect(400);
    expect(JSON.stringify(bad.body)).toMatch(/below the bottom/);
    await http().post("/v1/admin/talents").set(as("talent")).send({ ...profile("Bad Band"), photoUrl: "http://x.test/a.jpg" }).expect(400);
    await http().post("/v1/admin/talents").set(as("talent")).send({ ...profile("Bad Band"), categories: ["nope"] }).expect(400);
    await http().post("/v1/admin/talents").set(as("sales")).send(profile("Sales Act")).expect(403);

    const { body } = await http().post("/v1/admin/talents").set(as("talent")).send(profile(`Rate Act ${Date.now()}`)).expect(201);
    const card = { sellingRatePaise: "25000000", minimumRatePaise: "20000000", payoutBps: 8000 };
    await http().put(`/v1/admin/talents/${body.slug}/rate-card`).set(as("sales")).send(card).expect(403);
    await http().put(`/v1/admin/talents/${body.slug}/rate-card`).set(as("accounts")).send({ ...card, minimumRatePaise: "30000000" }).expect(400);
    await http().put(`/v1/admin/talents/${body.slug}/rate-card`).set(as("accounts")).send(card).expect(204);
    const seen = await http().get(`/v1/admin/talents/${body.slug}`).set(as("sales")).expect(200);
    expect(seen.body.rateCard.sellingRatePaise).toBe("25000000");
  });
});

describe("bulk CSV import", () => {
  const header = "stage_name,headline,bio,base_city,categories,languages,event_types,tier,representation,fee_from_inr,fee_to_inr,photo_url,rep_name,rep_phone,rep_agency,standard_rate_inr,minimum_rate_inr,payout_percent";
  const name = (n: string) => `CSV ${n} ${Date.now()}`;

  it("checks every row, then imports the valid ones as drafts with rep and rate card", async () => {
    const good = name("Good");
    const csv = [
      header,
      `"${good}",Live band,"A versatile live act for weddings, sangeets and corporate nights.",Pune,Singers; DJs,Hindi; English,Wedding,premium,agency,"1,50,000",300000,https://images.example.com/a.jpg,Asha Rao,9876500001,Spotlight,250000,200000,80`,
      `${name("Bad")},x,short,Pune,Jugglers,,Wedding,gold,agency,500,100,http://insecure.example/a.jpg,,,,,,`,
      `"${good}",Again,"Same artist twice in one file should be caught here.",Pune,Singers,Hindi,,,,,,https://images.example.com/b.jpg,,,,,,`,
    ].join("\n");

    await http().post("/v1/admin/talents/import").set(as("sales")).send({ csv }).expect(403);
    const check = await http().post("/v1/admin/talents/import").set(as("talent")).send({ csv }).expect(200);
    expect(check.body.valid).toBe(1);
    expect(check.body.created).toBe(0);
    const [ok, bad, dup] = check.body.rows;
    expect(ok).toMatchObject({ line: 2, stageName: good, errors: [] });
    expect(bad.errors.join(" | ")).toMatch(/categories: “Jugglers” isn't a category/);
    expect(bad.errors.join(" | ")).toMatch(/tier: use standard or premium/);
    expect(bad.errors.join(" | ")).toMatch(/photo_url: Use an https image link/);
    expect(bad.errors.join(" | ")).toMatch(/fee_to_inr: The top of the band can't be below the bottom/);
    expect(dup.errors).toContain("stage_name: also on line 2 of this file");
    expect(await db.talent.count({ where: { stageName: good } })).toBe(0);

    const done = await http().post("/v1/admin/talents/import").set(as("talent")).send({ csv, commit: true }).expect(200);
    expect(done.body.created).toBe(1);
    const slug = done.body.rows[0].slug as string;
    const talent = await db.talent.findUniqueOrThrow({ where: { slug }, include: { rateCards: true, reps: { include: { rep: true } }, categories: { include: { category: true } } } });
    expect(talent).toMatchObject({ status: "DRAFT", tier: "PREMIUM", feeBandMinPaise: 15_000_000n, feeBandMaxPaise: 30_000_000n });
    expect(talent.categories.map((c) => c.category.slug).sort()).toEqual(["djs", "singers"]);
    expect(talent.reps[0]!.rep).toMatchObject({ name: "Asha Rao", agencyName: "Spotlight", verification: "PENDING" });
    expect(talent.rateCards[0]).toMatchObject({ sellingRatePaise: 25_000_000n, minimumRatePaise: 20_000_000n, payoutBps: 8000 });

    // Importing the same file again: the artist is already on the roster.
    const again = await http().post("/v1/admin/talents/import").set(as("talent")).send({ csv }).expect(200);
    expect(again.body.rows[0].errors).toContain("stage_name: already on the roster");
    expect(await db.auditLog.count({ where: { action: "talent.import", summary: { contains: good } } })).toBe(1);
  });

  it("reports a missing required column on every row", async () => {
    const res = await http().post("/v1/admin/talents/import").set(as("talent")).send({ csv: "stage_name,headline\nSolo,Singer" }).expect(200);
    expect(res.body.rows[0].errors).toEqual(expect.arrayContaining(["photo_url: column missing from the file", "bio: column missing from the file"]));
    await http().post("/v1/admin/talents/import").set(as("talent")).send({ csv: "stage_name,headline\nSolo,Singer", commit: true }).expect(400);
  });
});
