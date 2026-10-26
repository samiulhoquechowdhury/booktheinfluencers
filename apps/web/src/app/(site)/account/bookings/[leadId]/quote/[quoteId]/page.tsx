import { Suspense } from "react";
import { PrintableQuote } from "@/components/account/booking/printable";
import { Spinner } from "@/components/ui/feedback";

export default function QuotePage({ params }: PageProps<"/account/bookings/[leadId]/quote/[quoteId]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <Quote params={params} />
    </Suspense>
  );
}

async function Quote({ params }: Pick<PageProps<"/account/bookings/[leadId]/quote/[quoteId]">, "params">) {
  const { leadId, quoteId } = await params;
  return <PrintableQuote leadId={leadId} quoteId={quoteId} />;
}
