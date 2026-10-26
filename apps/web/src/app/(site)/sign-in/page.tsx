import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { SignInPanel } from "@/components/auth/sign-in-panel";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-start justify-center bg-cream-soft px-4 py-16">
      <Suspense fallback={<Spinner />}>
        <SignInPanel />
      </Suspense>
    </div>
  );
}
