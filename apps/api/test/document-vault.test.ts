import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env";
import { openDocument, sealDocument } from "../src/talent/document-vault";

const file = Buffer.concat([Buffer.from("%PDF-1.4 Aadhaar"), Buffer.alloc(5000, 7)]);

describe("ID document vault", () => {
  it("round-trips a file and hides its contents", () => {
    const sealed = sealDocument(file, "talent_a");
    expect(Buffer.from(sealed).includes("Aadhaar")).toBe(false);
    expect(openDocument(sealed, "talent_a").equals(file)).toBe(true);
  });

  it("gives the same file a different result every time", () => {
    expect(Buffer.from(sealDocument(file, "t")).equals(Buffer.from(sealDocument(file, "t")))).toBe(false);
  });

  it("refuses another artist's file, damaged files and unencrypted ones", () => {
    const sealed = sealDocument(file, "talent_a");
    expect(() => openDocument(sealed, "talent_b")).toThrow(/can't be opened/);
    for (const at of [10, 40, 70, sealed.length - 1]) {
      const damaged = Uint8Array.from(sealed);
      damaged[at]! ^= 1;
      expect(() => openDocument(damaged, "talent_a")).toThrow(/can't be opened/);
    }
    expect(() => openDocument(new Uint8Array(file), "talent_a")).toThrow(/can't be opened/);
  });

  it("won't start in production on the development key", () => {
    const base = { DATABASE_URL: "postgresql://x:y@localhost/z", NODE_ENV: "production", JWT_SECRET: "a".repeat(32), TOKEN_HASH_SECRET: "b".repeat(32), WEBHOOK_SECRET: "c".repeat(32) };
    expect(() => loadEnv(base)).toThrow(/ID_DOCUMENT_KEY must be set/);
    expect(() => loadEnv({ ...base, ID_DOCUMENT_KEY: "too-short" })).toThrow(/32 bytes/);
    const documents = { ID_DOCUMENT_KEY: Buffer.alloc(32, 9).toString("base64") };
    expect(() => loadEnv({ ...base, ...documents })).toThrow(/SETTINGS_KEY must be set/);
    expect(loadEnv({ ...base, ...documents, SETTINGS_KEY: Buffer.alloc(32, 8).toString("base64") }).NODE_ENV).toBe("production");
  });
});
