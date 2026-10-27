import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInStaff, startApp } from "./helpers";

let app: INestApplication;
let http: Awaited<ReturnType<typeof startApp>>["http"];
const tokens: Record<string, string> = {};
const as = (role: string) => ({ authorization: `Bearer ${tokens[role]}` });

beforeAll(async () => {
  ({ app, http } = await startApp());
  for (const role of ["accounts", "sales"]) tokens[role] = await signInStaff(app, `${role}@demo.in`);
});
afterAll(async () => {
  await app?.close();
});

describe("payment reconciliation", () => {
  it("lets Accounts run the checks and see the latest run and history", async () => {
    await http().get("/v1/admin/reconciliation").set(as("sales")).expect(403);
    await http().post("/v1/admin/reconciliation/run").set(as("sales")).expect(403);

    const run = await http().post("/v1/admin/reconciliation/run").set(as("accounts")).expect(200);
    expect(run.body).toMatchObject({ trigger: "Meena Iyer", ok: expect.any(Boolean), errorCount: expect.any(Number), findings: expect.any(Array) });
    expect(run.body.totals.checkedMilestones).toBeGreaterThan(0);

    const overview = await http().get("/v1/admin/reconciliation").set(as("accounts")).expect(200);
    expect(overview.body.latest.id).toBe(run.body.id);
    expect(overview.body.history[0]).toMatchObject({ id: run.body.id, trigger: "Meena Iyer" });
    expect(overview.body.history[0].findings).toBeUndefined();
  });
});
