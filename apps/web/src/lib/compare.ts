"use client";

import { useSyncExternalStore } from "react";

// CAT-9: compare up to three artists. A per-browser convenience, so localStorage is enough.
const KEY = "btf.compare.v1";
export const COMPARE_LIMIT = 3;

const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string").slice(0, COMPARE_LIMIT) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: string[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: keep the in-memory list for this tab.
  }
  for (const listener of listeners) listener();
}

const EMPTY: string[] = [];

export function useCompareList() {
  const list = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => EMPTY,
  );
  return {
    list,
    has: (slug: string) => list.includes(slug),
    full: list.length >= COMPARE_LIMIT,
    toggle: (slug: string) => write(list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug].slice(0, COMPARE_LIMIT)),
    remove: (slug: string) => write(list.filter((s) => s !== slug)),
    clear: () => write([]),
  };
}
