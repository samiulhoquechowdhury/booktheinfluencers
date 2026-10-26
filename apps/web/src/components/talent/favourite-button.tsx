"use client";

import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { useFavourites, useSession, useToggleFavourite } from "@/lib/api/hooks";

/** CAT-8: favourites need a customer account; guests are sent to sign in. */
export function FavouriteButton({
  slug,
  name,
  variant = "overlay",
}: {
  slug: string;
  name: string;
  variant?: "overlay" | "inline";
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const signedIn = Boolean(session?.roles.includes("CUSTOMER"));
  const { data: favourites = [] } = useFavourites(signedIn);
  const toggle = useToggleFavourite();
  const saved = favourites.includes(slug);

  const onClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    toggle.mutate(slug);
  };

  const label = saved ? `Remove ${name} from favourites` : `Save ${name} to favourites`;

  if (variant === "inline") {
    return (
      <button type="button" onClick={onClick} aria-pressed={saved} className="btn btn-outline">
        <Heart className={saved ? "fill-rose-500 text-rose-500" : ""} aria-hidden />
        {saved ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-full bg-white/90 text-ink shadow-sm backdrop-blur transition-transform hover:scale-105"
    >
      <Heart className={`size-[18px] ${saved ? "fill-rose-500 text-rose-500" : ""}`} aria-hidden />
    </button>
  );
}
