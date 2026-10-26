import { describe, expect, it } from "vitest";
import { TALENTS } from "./data";
import { parseFilters, searchTalents } from "./query";

describe("searchTalents", () => {
  it("returns everyone with no filters, featured first", () => {
    const { data, meta } = searchTalents({});
    expect(meta.total).toBe(TALENTS.length);
    expect(data[0]!.featured).toBe(true);
  });

  it("filters by category, language and verified", () => {
    const { data } = searchTalents({ category: "comedians", verified: true });
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((t) => t.categories.includes("comedians") && t.verified)).toBe(true);
    expect(searchTalents({ language: "Bengali" }).data.map((t) => t.slug)).toEqual(["ananya-bose"]);
  });

  it("matches every keyword against name, bio and tags", () => {
    expect(searchTalents({ q: "sufi" }).data.map((t) => t.slug)).toContain("zoya-sheikh");
    expect(searchTalents({ q: "sufi edm" }).meta.total).toBe(0);
  });

  it("keeps artists whose fee band overlaps the budget", () => {
    const { data } = searchTalents({ budget: "under-1l" });
    expect(data.every((t) => BigInt(t.feeBandMinPaise!) <= 10_000_000n)).toBe(true);
  });

  it("hides artists with a blackout on the chosen date", () => {
    expect(searchTalents({ date: "2026-12-31" }).data.map((t) => t.slug)).not.toContain("aanya-kapoor");
    expect(searchTalents({ date: "2026-12-30" }).data.map((t) => t.slug)).toContain("aanya-kapoor");
  });

  it("includes artists who travel to the city", () => {
    const slugs = searchTalents({ city: "guwahati" }).data.map((t) => t.slug);
    expect(slugs).toContain("aanya-kapoor"); // Pan-India
    expect(slugs).not.toContain("ananya-bose"); // East India only, not listed as Guwahati
  });

  it("sorts by fee", () => {
    const fees = searchTalents({ sort: "fee-asc" }).data.map((t) => BigInt(t.feeBandMinPaise!));
    expect(fees).toEqual(fees.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it("never exposes profile-only fields in listings", () => {
    expect(Object.keys(searchTalents({}).data[0]!)).not.toContain("bio");
  });
});

describe("parseFilters", () => {
  it("ignores unknown sorts and bad pages", () => {
    expect(parseFilters({ sort: "evil", page: "-2", verified: "1", q: "  dj " })).toMatchObject({
      sort: undefined,
      page: undefined,
      verified: true,
      q: "dj",
    });
  });
});
