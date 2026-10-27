import type { LoginEventRecord, SignInsPage } from "@repo/schemas";
import type { StaffUser } from "./internal";
import { ApiError, newId, nowIso } from "./server";
import type { MockDb } from "./types";

// Sign-in history for the in-browser mock. Mirrors apps/api/src/auth/login-events.ts. There's no server here,
// so the IP is unknown; the device comes from this browser.

const MAX_KEPT = 500;

export function recordLogin(db: MockDb, entry: Omit<LoginEventRecord, "id" | "at" | "ip" | "userAgent">) {
  db.loginEvents.unshift({
    ...entry,
    id: newId("login"),
    at: nowIso(),
    ip: null,
    userAgent: typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 300),
  });
  db.loginEvents.length = Math.min(db.loginEvents.length, MAX_KEPT);
}

export function signIns(
  db: MockDb,
  actor: StaffUser,
  f: { audience?: string; event?: string; q?: string; userId?: string; before?: string } = {},
): SignInsPage {
  if (!actor.roles.includes("SUPER_ADMIN")) throw new ApiError("FORBIDDEN", "Your role can't do that");
  const PAGE = 100;
  const q = f.q?.trim().toLowerCase();
  const rows = db.loginEvents.filter(
    (e) =>
      (!f.audience || e.audience === f.audience) &&
      (!f.event || e.event === f.event) &&
      (!f.userId || e.userId === f.userId) &&
      (!q || `${e.identifier} ${e.userName ?? ""}`.toLowerCase().includes(q)) &&
      (!f.before || e.at < f.before),
  );
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const recent = db.loginEvents.filter((e) => e.at >= since);
  const page = rows.slice(0, PAGE);
  return {
    events: page,
    nextBefore: rows.length > PAGE ? page.at(-1)!.at : null,
    last24h: {
      signIns: recent.filter((e) => e.event === "sign_in").length,
      failed: recent.filter((e) => e.event === "sign_in_failed").length,
      people: new Set(recent.filter((e) => e.event === "sign_in" && e.userId).map((e) => e.userId)).size,
    },
  };
}
