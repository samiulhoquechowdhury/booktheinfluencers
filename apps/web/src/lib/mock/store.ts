import type { MockDb } from "./types";
import { buildSeed } from "./seed";

// Browser-only persistence for the mock API. Bump the key when the record shapes change.
const DB_KEY = "btf.mock.db.v1";
const SESSION_KEY = "btf.mock.session.v1";

let memory: MockDb | null = null;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadDb(): MockDb {
  if (memory) return memory;
  const raw = storage()?.getItem(DB_KEY);
  if (raw) {
    try {
      memory = JSON.parse(raw) as MockDb;
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

export function readSessionUserId(): string | null {
  return storage()?.getItem(SESSION_KEY) ?? null;
}

export function writeSessionUserId(userId: string | null) {
  if (userId) storage()?.setItem(SESSION_KEY, userId);
  else storage()?.removeItem(SESSION_KEY);
}
