import type { Metadata } from "next";

export const metadata: Metadata = { title: "Talent portal", robots: { index: false } };

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <div className="flex-1 bg-cream-soft">
      <div className="shell py-10 sm:py-14">{children}</div>
    </div>
  );
}
