import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@repo/db";
import { keysDeep, randomPhone, signInCustomer, signInStaff, startApp } from "./helpers";

let app: INestApplication;
let db: PrismaClient;
let http: Awaited<ReturnType<typeof startApp>>["http"];
const tokens: Record<string, string> = {};
const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(200)]);

async function signUp(name: string) {
  const phone = randomPhone();
  await http().post("/v1/auth/otp/send").send({ phone }).expect(200);
  const res = await http().post("/v1/auth/otp/verify").send({ phone, code: "123456", name, as: "talent" }).expect(200);
  tokens[name] = res.body.accessToken;
  return { phone, slug: res.body.user.talentSlug as string };
}

const profile = (stageName: string, photoUrl: string) => ({
  legalName: "Riya Sen",
  stageName,
  headline: "Sufi and folk singer",
  bio: "A versatile live act playing weddings and corporate nights across India.",
  baseCity: "Pune",
  categories: ["singers"],
  languages: ["Hindi", "English"],
  eventTypes: ["Wedding"],
  travelsTo: ["Pan-India"],
  feeFromRupees: "150000",
  feeToRupees: "300000",
  photoUrl,
  galleryUrls: [],
  socialLinks: { instagram: "https://instagram.com/riyasen", youtube: "https://www.youtube.com/@riyasen" },
});

async function complete(who: string, stageName: string) {
  const photo = await http().post("/v1/talent/onboarding/photo?width=800&height=800").set(as(who)).set("content-type", "image/jpeg").send(JPEG).expect(201);
  await http().put("/v1/talent/onboarding").set(as(who)).send(profile(stageName, photo.body.url)).expect(200);
  const doc = await http().post("/v1/talent/onboarding/documents?type=AADHAAR&fileName=aadhaar.pdf").set(as(who)).set("content-type", "application/pdf").send(PDF).expect(201);
  return doc.body.id as string;
}

beforeAll(async () => {
  ({ app, db, http } = await startApp());
  for (const role of ["talent", "sales"]) tokens[role] = await signInStaff(app, `${role}@demo.in`);
  tokens.customer = await signInCustomer(app, randomPhone(), "Curious Customer");
});
afterAll(async () => {
  // Other files count the published catalogue.
  await db?.talent.deleteMany({ where: { reviewStatus: { not: null } } });
  await app?.close();
});

describe("artist onboarding", () => {
  it("runs from sign-up to a verified public profile, only after approval", async () => {
    const name = `Riya ${Date.now()}`;
    const { slug: draftSlug } = await signUp(name);

    const start = await http().get("/v1/talent/onboarding").set(as(name)).expect(200);
    expect(start.body).toMatchObject({ status: "INCOMPLETE", editable: true, live: false });
    expect(start.body.missing.map((m: { label: string }) => m.label)).toEqual(expect.arrayContaining(["Your full legal name", "A profile photo", "At least one social media link", "At least one government ID"]));
    const early = await http().post("/v1/talent/onboarding/submit").set(as(name)).expect(409);
    expect(early.body.error.message).toMatch(/Still needed/);

    await http().put("/v1/talent/onboarding").set(as(name)).send({ ...profile(name, ""), socialLinks: { instagram: "http://youtube.com/x" } }).expect(400);
    await http().post("/v1/talent/onboarding/documents?type=AADHAAR&fileName=a.pdf").set(as(name)).set("content-type", "image/png").send(JPEG).expect(400);
    await http().post("/v1/talent/onboarding/documents?type=LIBRARY_CARD&fileName=a.pdf").set(as(name)).set("content-type", "application/pdf").send(PDF).expect(400);

    const docId = await complete(name, name);
    const ready = await http().get("/v1/talent/onboarding").set(as(name)).expect(200);
    expect(ready.body.missing).toEqual([]);
    expect(ready.body.documents[0]).toMatchObject({ type: "AADHAAR", fileName: "aadhaar.pdf" });

    const submitted = await http().post("/v1/talent/onboarding/submit").set(as(name)).expect(200);
    expect(submitted.body).toMatchObject({ status: "SUBMITTED", editable: false, live: false });
    const slug = submitted.body.slug as string;
    expect(slug).not.toBe(draftSlug);
    expect(slug).toMatch(/^riya-/);

    // Locked during review, and still not public.
    await http().put("/v1/talent/onboarding").set(as(name)).send(profile(name, "")).expect(409);
    await http().get(`/v1/talents/${slug}`).expect(404);
    expect(JSON.stringify((await http().get("/v1/talents").query({ q: "riya" })).body)).not.toContain(slug);
    const publish = await http().post(`/v1/admin/talents/${slug}/status`).set(as("talent")).send({ status: "PUBLISHED" }).expect(409);
    expect(publish.body.error.message).toMatch(/Verifications/);

    await http().get("/v1/admin/verifications").set(as("sales")).expect(403);
    const queue = await http().get("/v1/admin/verifications").set(as("talent")).expect(200);
    expect(queue.body.find((r: { slug: string }) => r.slug === slug)).toMatchObject({ status: "SUBMITTED", documentCount: 1, legalName: "Riya Sen" });
    const detail = await http().get(`/v1/admin/verifications/${slug}`).set(as("talent")).expect(200);
    expect(detail.body.socialLinks.instagram).toBe("https://instagram.com/riyasen");

    await http().get(`/v1/admin/verifications/documents/${docId}`).set(as("sales")).expect(403);
    const file = await http().get(`/v1/admin/verifications/documents/${docId}`).set(as("talent")).expect(200);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(await db.auditLog.count({ where: { action: "talent.documentViewed", entityId: slug } })).toBe(1);

    // Sent back: the artist sees why, fixes it and resubmits.
    await http().post(`/v1/admin/verifications/${slug}/reject`).set(as("talent")).send({ reason: "x" }).expect(400);
    await http().post(`/v1/admin/verifications/${slug}/reject`).set(as("talent")).send({ reason: "The name doesn't match your Aadhaar." }).expect(204);
    const rejected = await http().get("/v1/talent/onboarding").set(as(name)).expect(200);
    expect(rejected.body).toMatchObject({ status: "REJECTED", editable: true, reviewNote: "The name doesn't match your Aadhaar." });
    await http().post("/v1/talent/onboarding/submit").set(as(name)).expect(200);

    await http().post(`/v1/admin/verifications/${slug}/approve`).set(as("sales")).expect(403);
    await http().post(`/v1/admin/verifications/${slug}/approve`).set(as("talent")).expect(204);
    await http().post(`/v1/admin/verifications/${slug}/approve`).set(as("talent")).expect(409); // not waiting any more

    const approved = await http().get("/v1/talent/onboarding").set(as(name)).expect(200);
    expect(approved.body).toMatchObject({ status: "APPROVED", live: true, editable: false });
    const pub = await http().get(`/v1/talents/${slug}`).expect(200);
    expect(pub.body).toMatchObject({ stageName: name, verified: true, photo: expect.stringMatching(/^\/v1\/media\//) });
    const keys = keysDeep(pub.body);
    for (const secret of ["legalName", "documents", "socialLinks", "reviewNote", "phone"]) expect(keys.has(secret)).toBe(false);
    expect(await db.notification.count({ where: { event: "talent.approved", body: { contains: name } } })).toBe(1);
  });

  it("keeps ID documents private", async () => {
    const owner = `Owner ${Date.now()}`;
    await signUp(owner);
    const docId = await complete(owner, owner);
    const other = `Other ${Date.now()}`;
    await signUp(other);

    await http().get(`/v1/talent/onboarding/documents/${docId}`).set(as(owner)).expect(200);

    // Encrypted in the database: the stored bytes are unreadable, and a tampered row is refused rather than served.
    const stored = await db.talentDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(Buffer.from(stored.bytes).includes("%PDF")).toBe(false);
    const tampered = Buffer.from(stored.bytes);
    tampered[tampered.length - 1]! ^= 1;
    await db.talentDocument.update({ where: { id: docId }, data: { bytes: new Uint8Array(tampered) } });
    const refused = await http().get(`/v1/talent/onboarding/documents/${docId}`).set(as(owner)).expect(422);
    expect(refused.body.error.code).toBe("DOCUMENT_UNREADABLE");
    await db.talentDocument.update({ where: { id: docId }, data: { bytes: stored.bytes } });
    await http().get(`/v1/talent/onboarding/documents/${docId}`).set(as(owner)).expect(200);

    await http().get(`/v1/talent/onboarding/documents/${docId}`).set(as(other)).expect(404);
    await http().get(`/v1/talent/onboarding/documents/${docId}`).set(as("customer")).expect(403);
    await http().get(`/v1/talent/onboarding/documents/${docId}`).expect(401);
    await http().get(`/v1/media/${docId}`).expect(404);
    await http().delete(`/v1/talent/onboarding/documents/${docId}`).set(as(other)).expect(404);
    await http().delete(`/v1/talent/onboarding/documents/${docId}`).set(as(owner)).expect(204);
  });

  it("lets a customer also join as an artist, and leaves existing artists alone", async () => {
    const phone = randomPhone();
    await signInCustomer(app, phone, "Both Ways");
    await db.otpCode.deleteMany({ where: { phone } });
    await http().post("/v1/auth/otp/send").send({ phone }).expect(200);
    const res = await http().post("/v1/auth/otp/verify").send({ phone, code: "123456", as: "talent" }).expect(200);
    expect(res.body.user.roles.sort()).toEqual(["CUSTOMER", "TALENT"]);

    await db.otpCode.deleteMany({ where: { phone: "9800000001" } });
    await http().post("/v1/auth/otp/send").send({ phone: "9800000001" }).expect(200);
    const seeded = await http().post("/v1/auth/otp/verify").send({ phone: "9800000001", code: "123456", as: "talent" }).expect(200);
    const state = await http().get("/v1/talent/onboarding").set({ authorization: `Bearer ${seeded.body.accessToken}` }).expect(200);
    expect(state.body).toMatchObject({ status: "APPROVED", editable: false, live: true });
  });
});
