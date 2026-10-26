import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Minimal chrome for the simulated third-party screens (gateway checkout, e-sign). */
export default function ProviderLayout({ children }: LayoutProps<"/">) {
  return <main className="flex flex-1 items-start justify-center bg-cream-soft px-4 py-12 sm:py-16">{children}</main>;
}
