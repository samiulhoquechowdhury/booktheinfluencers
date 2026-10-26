"use client";

import Link from "next/link";
import { Check, GitCompareArrows } from "lucide-react";
import { toast } from "sonner";
import { COMPARE_LIMIT, useCompareList } from "@/lib/compare";

export function CompareButton({ slug }: { slug: string }) {
  const compare = useCompareList();
  const added = compare.has(slug);

  return (
    <button
      type="button"
      aria-pressed={added}
      onClick={() => {
        if (!added && compare.full) {
          toast.error(`You can compare up to ${COMPARE_LIMIT} artists. Remove one first.`);
          return;
        }
        compare.toggle(slug);
      }}
      className="btn btn-outline"
    >
      {added ? <Check aria-hidden /> : <GitCompareArrows aria-hidden />}
      {added ? "In compare" : "Compare"}
    </button>
  );
}

/** Floating tray shown once something is in the compare list. */
export function CompareTray() {
  const { list, clear } = useCompareList();
  if (list.length === 0) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-card bg-ink px-5 py-3 text-white shadow-card sm:inset-x-auto sm:right-6">
      <span className="text-sm">
        {list.length} of {COMPARE_LIMIT} selected
      </span>
      <span className="flex items-center gap-2">
        <button type="button" onClick={clear} className="text-sm text-white/60 hover:text-white">
          Clear
        </button>
        <Link href="/compare" className="btn btn-gold btn-sm">
          Compare
        </Link>
      </span>
    </div>
  );
}
