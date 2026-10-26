import { beforeEach, describe, expect, it } from "vitest";
import { STAFF_USERS } from "./internal";
import { buildSeed } from "./seed";
import { createHero, deleteHero, listHero, publicHero, updateHero, uploadMedia } from "./site";
import { changeStaffPassword, createStaff, resetStaffPassword, setStaffActive, staffCodeStep, staffDirectory, staffPasswordStep, updateStaff } from "./staff-accounts";
import type { MockDb } from "./types";

const admin = STAFF_USERS.find((s) => s.roles.includes("SUPER_ADMIN"))!;
const sales = STAFF_USERS.find((s) => s.roles.includes("SALES"))!;
const PIXEL = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

let db: MockDb;
beforeEach(() => {
  db = buildSeed();
});

describe("mock staff accounts", () => {
  it("creates staff who set up an authenticator and change their temporary password", () => {
    expect(() => createStaff(db, sales, { name: "X", email: "x@demo.in", roles: ["SALES"] })).toThrow(/super admins/);
    const created = createStaff(db, admin, { name: "Asha Nair", email: "Asha@Demo.in", roles: ["SALES"] });
    expect(created).toMatchObject({ email: "asha@demo.in", mustChangePassword: true, mfaEnrolled: false });
    expect(staffPasswordStep(db, "asha@demo.in", created.temporaryPassword).setup).toBeDefined();
    staffCodeStep(db, created.id, "123456");
    changeStaffPassword(db, created.id, { current: created.temporaryPassword, next: "better-pass-123" });
    expect(staffPasswordStep(db, "asha@demo.in", "better-pass-123").setup).toBeUndefined();
  });

  it("deactivates, resets and protects the last super admin", () => {
    const created = createStaff(db, admin, { name: "Ravi", email: "ravi@demo.in", roles: ["OPS"] });
    updateStaff(db, admin, created.id, { name: "Ravi Menon", roles: ["OPS", "ACCOUNTS"] });
    setStaffActive(db, admin, created.id, false);
    expect(() => staffPasswordStep(db, "ravi@demo.in", created.temporaryPassword)).toThrow(/deactivated/);
    expect(staffDirectory(db).some((s) => s.id === created.id)).toBe(false);
    setStaffActive(db, admin, created.id, true);
    const { temporaryPassword } = resetStaffPassword(db, admin, created.id);
    expect(staffPasswordStep(db, "ravi@demo.in", temporaryPassword).staffId).toBe(created.id);
    expect(() => setStaffActive(db, admin, admin.id, false)).toThrow(/your own/);
    expect(() => updateStaff(db, admin, admin.id, { name: admin.name, roles: ["SALES"] })).toThrow(/your own/);
  });
});

describe("mock hero", () => {
  const slide = {
    eyebrow: "Stars & creators",
    title: "From the big screen",
    accent: "to every feed.",
    body: "Actors, playback singers and creators, booked through their own managers.",
    ctaLabel: "Browse creators",
    ctaHref: "/categories/creators",
    imageAlt: "Film stars beside creators filming",
    imageId: null,
    active: true,
  };

  it("adds slides with uploaded photos and keeps one on the home page", () => {
    expect(() => createHero(db, admin, slide)).toThrow(/photo/);
    const media = uploadMedia(db, admin, PIXEL, 1672, 941);
    const created = createHero(db, admin, { ...slide, imageId: media.id });
    expect(publicHero(db).map((s) => s.title)).toEqual(["Book the talent.", "From the big screen"]);
    updateHero(db, admin, created.id, { ...slide, imageId: media.id, active: false });
    expect(publicHero(db)).toHaveLength(1);
    const [only] = listHero(db, admin);
    expect(() => deleteHero(db, admin, only!.id)).toThrow(/at least one/);
    expect(() => listHero(db, sales)).toThrow(/super admins/);
  });
});
