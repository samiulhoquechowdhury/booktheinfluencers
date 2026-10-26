import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoEsign } from "@/components/providers/demo-esign";
import { Spinner } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Sign agreement" };

export default function EsignPage({ params }: PageProps<"/esign/[contractId]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <Esign params={params} />
    </Suspense>
  );
}

async function Esign({ params }: Pick<PageProps<"/esign/[contractId]">, "params">) {
  const { contractId } = await params;
  return <DemoEsign contractId={contractId} />;
}
