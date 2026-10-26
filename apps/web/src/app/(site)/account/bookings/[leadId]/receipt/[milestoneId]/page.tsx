import { Suspense } from "react";
import { PrintableReceipt } from "@/components/account/booking/printable";
import { Spinner } from "@/components/ui/feedback";

export default function ReceiptPage({ params }: PageProps<"/account/bookings/[leadId]/receipt/[milestoneId]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <Receipt params={params} />
    </Suspense>
  );
}

async function Receipt({ params }: Pick<PageProps<"/account/bookings/[leadId]/receipt/[milestoneId]">, "params">) {
  const { leadId, milestoneId } = await params;
  return <PrintableReceipt leadId={leadId} milestoneId={milestoneId} />;
}
