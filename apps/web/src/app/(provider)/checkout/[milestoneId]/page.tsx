import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoCheckout } from "@/components/providers/demo-checkout";
import { Spinner } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Secure checkout" };

export default function CheckoutPage({ params }: PageProps<"/checkout/[milestoneId]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <Checkout params={params} />
    </Suspense>
  );
}

async function Checkout({ params }: Pick<PageProps<"/checkout/[milestoneId]">, "params">) {
  const { milestoneId } = await params;
  return <DemoCheckout milestoneId={milestoneId} />;
}
