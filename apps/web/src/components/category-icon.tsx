import { Disc3, Drama, MicVocal, Presentation, Sparkles, type LucideProps } from "lucide-react";
import type { CATEGORIES } from "@/lib/catalogue/data";

const ICONS = { MicVocal, Disc3, Drama, Presentation, Sparkles };

export function CategoryIcon({ icon, ...props }: { icon: (typeof CATEGORIES)[number]["icon"] } & LucideProps) {
  const Icon = ICONS[icon];
  return <Icon aria-hidden {...props} />;
}
