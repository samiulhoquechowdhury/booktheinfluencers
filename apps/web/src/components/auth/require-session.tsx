"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/api/hooks";
import type { Session } from "@/lib/api/client";
import { Spinner } from "@/components/ui/feedback";

/** Client-side gate for signed-in areas. UI only — the API checks access on every call (rules.md §5). */
export function RequireSession({
  role,
  children,
}: {
  role: "CUSTOMER" | "TALENT";
  children: (session: Session) => ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = Boolean(session?.roles.includes(role));

  useEffect(() => {
    if (isPending || allowed) return;
    const as = role === "TALENT" ? "&as=talent" : "";
    router.replace(`/sign-in?next=${encodeURIComponent(pathname)}${as}`);
  }, [allowed, isPending, pathname, role, router]);

  if (isPending || !session || !allowed) return <Spinner label="Checking your session" />;
  return <>{children(session)}</>;
}
