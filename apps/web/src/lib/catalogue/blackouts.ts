// Sample blackout dates (AVL-4), keyed by talent slug. ISO calendar dates in India time.
// The talent portal can add more; those live in the browser mock store.
export const BLACKOUT_SEED: Record<string, string[]> = {
  "aanya-kapoor": ["2026-12-12", "2026-12-13", "2026-12-31"],
  "kabir-malhotra": ["2026-11-21"],
  "dj-rhea": ["2026-12-31"],
  "aria-mehta": ["2026-12-05", "2026-12-06"],
};
