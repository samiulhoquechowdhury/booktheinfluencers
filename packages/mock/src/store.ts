import type { MockDb } from "./types";
import { buildSeed } from "./seed";
import { seedCalendar } from "./server";
import { DEFAULT_HERO_SLIDES } from "./site";
import { seedStaffAccounts } from "./staff-accounts";

// Browser-only persistence for the mock API. Bump the key when the record shapes change.
const DB_KEY = "btf.mock.db.v1";
const SESSION_KEY = "btf.mock.session.v1";

let memory: MockDb | null = null;

/**
 * Another tab (e.g. /admin) wrote the store: drop the cached copy and tell the caller,
 * so open pages refetch. Returns an unsubscribe function.
 */
export function onExternalChange(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const listener = (event: StorageEvent) => {
    if (event.key !== null && event.key !== DB_KEY) return;
    memory = null;
    callback();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Fills collections added after a browser first stored its data. */
function upgrade(db: MockDb): MockDb {
  db.messages ??= [];
  db.contactRequests ??= [];
  db.talentApplications ??= [];
  db.newsletter ??= [];
  db.notificationsSeenAt ??= {};
  db.audit ??= [];
  db.talentRecords ??= {};
  if (!db.calendar) {
    // Before the calendar store: onboarding dates came from the seed and the rest were the artist's.
    const legacy = (db as { blackouts?: Record<string, string[]> }).blackouts ?? {};
    db.calendar = seedCalendar();
    for (const [slug, dates] of Object.entries(legacy))
      for (const date of dates) if (!db.calendar[slug]?.some((r) => r.date === date)) (db.calendar[slug] ??= []).push({ date, source: "artist", note: null, bookingId: null });
  }
  db.calendarSelfEdit ??= {};
  db.staffAccounts ??= seedStaffAccounts();
  db.heroSlides ??= structuredClone(DEFAULT_HERO_SLIDES);
  for (const slide of db.heroSlides) slide.textPosition ??= "left";
  if ((db.heroDefaultsVersion ?? 1) < 2) {
    // v2 added the client's two photos after the original slide.
    const top = Math.max(-1, ...db.heroSlides.map((s) => s.position));
    for (const [i, slide] of DEFAULT_HERO_SLIDES.slice(1).entries())
      if (!db.heroSlides.some((s) => s.id === slide.id)) db.heroSlides.push({ ...structuredClone(slide), position: top + 1 + i });
    db.heroDefaultsVersion = 2;
  }
  db.media ??= {};
  return db;
}

export function loadDb(): MockDb {
  if (memory) return memory;
  const raw = storage()?.getItem(DB_KEY);
  if (raw) {
    try {
      memory = upgrade(JSON.parse(raw) as MockDb);
      return memory;
    } catch {
      // Corrupt data: fall through and reseed.
    }
  }
  memory = buildSeed();
  saveDb(memory);
  return memory;
}

export function saveDb(db: MockDb) {
  memory = db;
  try {
    storage()?.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked: keep working in memory for this tab.
  }
}

/** Runs a change against the db and persists it; throws leave the stored copy untouched. */
export function mutate<T>(change: (db: MockDb) => T): T {
  const draft = structuredClone(loadDb());
  const result = change(draft);
  saveDb(draft);
  return result;
}

export function resetDb() {
  memory = null;
  storage()?.removeItem(DB_KEY);
  storage()?.removeItem(SESSION_KEY);
}

/** Staff sessions are separate from customer/talent ones (admin is its own app). */
const STAFF_SESSION_KEY = "btf.mock.staff.v1";

export function readStaffId(): string | null {
  return storage()?.getItem(STAFF_SESSION_KEY) ?? null;
}

export function writeStaffId(staffId: string | null) {
  if (staffId) storage()?.setItem(STAFF_SESSION_KEY, staffId);
  else storage()?.removeItem(STAFF_SESSION_KEY);
}

export function readSessionUserId(): string | null {
  return storage()?.getItem(SESSION_KEY) ?? null;
}

export function writeSessionUserId(userId: string | null) {
  if (userId) storage()?.setItem(SESSION_KEY, userId);
  else storage()?.removeItem(SESSION_KEY);
}
